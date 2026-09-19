import Foundation
import Security

enum Keychain {
    private static let service = "ru.etagere.app"

    static func set(_ value: String, key: String) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &out)
        guard status == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

struct PBUser: Codable, Hashable {
    var id: String
    var email: String?
    var name: String?
    var verified: Bool?
}

struct PBAuthResponse: Codable {
    var token: String
    var record: PBUser
}

struct PBList<T: Codable>: Codable {
    var items: [T]
}

struct PBBookRecord: Codable {
    var id: String
    var title: String?
    var author: String?
    var format: String?
    var page_count: Int?
    var last_page: Int?
    var local_id: String?
    var content_hash: String?
    var reading_status: String?
    var size_bytes: Int?
    var added_at: String?
    var meta_updated_at: String?
    var collection_ids: [String]?
}

struct PocketBaseClient {
    var baseURL: URL

    init(baseURL: URL = PocketBaseClient.defaultURL()) {
        self.baseURL = baseURL
    }

    static func defaultURL() -> URL {
        let stored = UserDefaults.standard.string(forKey: "etagere.pbURL")?
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if let stored, let url = URL(string: stored), !stored.isEmpty {
            return url
        }
        return URL(string: "https://api.etagere.ru")!
    }

    static func setDefaultURL(_ string: String) {
        UserDefaults.standard.set(string.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "etagere.pbURL")
    }

    func login(email: String, password: String) async throws -> PBAuthResponse {
        let url = baseURL.appending(path: "api/collections/users/auth-with-password")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "identity": email,
            "password": password,
        ])
        let (data, response) = try await URLSession.shared.data(for: req)
        try throwIfNeeded(data: data, response: response)
        return try JSONDecoder().decode(PBAuthResponse.self, from: data)
    }

    func listBooks(token: String) async throws -> [PBBookRecord] {
        var comps = URLComponents(
            url: baseURL.appending(path: "api/collections/books/records"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [
            URLQueryItem(name: "perPage", value: "200"),
            URLQueryItem(name: "sort", value: "-meta_updated_at"),
        ]
        var req = URLRequest(url: comps.url!)
        req.setValue(token, forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: req)
        try throwIfNeeded(data: data, response: response)
        return try JSONDecoder().decode(PBList<PBBookRecord>.self, from: data).items
    }

    func upsertBook(token: String, userId: String, book: Book) async throws -> String {
        var body: [String: Any] = [
            "user": userId,
            "title": book.title,
            "format": book.format.rawValue,
            "page_count": book.pageCount,
            "last_page": book.lastPage,
            "local_id": book.id.uuidString,
            "reading_status": book.readingStatus.rawValue,
            "size_bytes": book.sizeBytes,
            "added_at": ISO8601DateFormatter().string(from: book.addedAt),
            "meta_updated_at": ISO8601DateFormatter().string(from: book.updatedAt),
        ]
        if let author = book.author { body["author"] = author }
        if let hash = book.contentHash { body["content_hash"] = hash }

        if let cloudId = book.cloudId {
            let url = baseURL.appending(path: "api/collections/books/records/\(cloudId)")
            var req = URLRequest(url: url)
            req.httpMethod = "PATCH"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue(token, forHTTPHeaderField: "Authorization")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: req)
            try throwIfNeeded(data: data, response: response)
            return cloudId
        }

        let url = baseURL.appending(path: "api/collections/books/records")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(token, forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: req)
        try throwIfNeeded(data: data, response: response)
        struct Created: Codable { var id: String }
        return try JSONDecoder().decode(Created.self, from: data).id
    }

    private func throwIfNeeded(data: Data, response: URLResponse) throws {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let text = String(data: data, encoding: .utf8) ?? "HTTP \(code)"
            throw NSError(
                domain: "PocketBase",
                code: code,
                userInfo: [NSLocalizedDescriptionKey: friendlyError(text, code: code)]
            )
        }
    }

    private func friendlyError(_ body: String, code: Int) -> String {
        if body.contains("invalid login") || code == 400 {
            return L.t("Неверный email или пароль", "Invalid email or password")
        }
        if code == 403 {
            return L.t("Email не подтверждён", "Email is not verified")
        }
        return L.t("Ошибка сервера (\(code))", "Server error (\(code))")
    }
}
