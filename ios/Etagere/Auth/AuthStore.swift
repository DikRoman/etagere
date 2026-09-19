import Foundation
import SwiftUI

@MainActor
final class AuthStore: ObservableObject {
    @Published var user: PBUser?
    @Published var token: String?
    @Published var statusMessage: String?
    @Published var isBusy = false
    @Published var serverURL: String = PocketBaseClient.defaultURL().absoluteString

    var isLoggedIn: Bool { token != nil && user != nil }

    func hydrate() {
        serverURL = PocketBaseClient.defaultURL().absoluteString
        token = Keychain.get("pb.token")
        if let raw = Keychain.get("pb.user"),
           let data = raw.data(using: .utf8),
           let user = try? JSONDecoder().decode(PBUser.self, from: data)
        {
            self.user = user
        }
    }

    func login(email: String, password: String) async {
        isBusy = true
        statusMessage = nil
        defer { isBusy = false }
        do {
            PocketBaseClient.setDefaultURL(serverURL)
            let client = PocketBaseClient(baseURL: PocketBaseClient.defaultURL())
            let auth = try await client.login(email: email, password: password)
            token = auth.token
            user = auth.record
            Keychain.set(auth.token, key: "pb.token")
            if let data = try? JSONEncoder().encode(auth.record),
               let raw = String(data: data, encoding: .utf8)
            {
                Keychain.set(raw, key: "pb.user")
            }
            statusMessage = L.synced
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func logout() {
        token = nil
        user = nil
        Keychain.delete("pb.token")
        Keychain.delete("pb.user")
        statusMessage = nil
    }

    func sync(with library: LibraryStore) async {
        guard let token, let user else { return }
        isBusy = true
        statusMessage = L.syncing
        defer { isBusy = false }
        do {
            PocketBaseClient.setDefaultURL(serverURL)
            let client = PocketBaseClient(baseURL: PocketBaseClient.defaultURL())
            let remote = try await client.listBooks(token: token)

            for row in remote {
                if let hash = row.content_hash,
                   let local = library.books.first(where: { $0.contentHash == hash })
                {
                    var next = local
                    next.cloudId = row.id
                    if let last = row.last_page, last > next.lastPage {
                        next.lastPage = last
                    }
                    library.update(next)
                    continue
                }
                if let localId = row.local_id,
                   let uuid = UUID(uuidString: localId),
                   let local = library.books.first(where: { $0.id == uuid })
                {
                    var next = local
                    next.cloudId = row.id
                    library.update(next)
                }
            }

            for book in library.books {
                let id = try await client.upsertBook(token: token, userId: user.id, book: book)
                if book.cloudId != id {
                    var next = book
                    next.cloudId = id
                    library.update(next)
                }
            }
            statusMessage = L.synced
        } catch {
            statusMessage = error.localizedDescription
        }
    }
}
