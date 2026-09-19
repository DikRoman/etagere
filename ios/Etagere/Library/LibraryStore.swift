import Foundation
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class LibraryStore: ObservableObject {
    @Published var books: [Book] = []
    @Published var collections: [BookCollection] = []
    @Published var filter: LibraryFilter = .all
    @Published var query = ""
    @Published var openedBook: Book?
    @Published var errorMessage: String?

    func hydrate() {
        let snap = BookStorage.loadSnapshot()
        books = snap.books.sorted { $0.updatedAt > $1.updatedAt }
        collections = snap.collections.sorted { $0.createdAt < $1.createdAt }
    }

    func persist() {
        BookStorage.saveSnapshot(LibrarySnapshot(books: books, collections: collections))
    }

    var filteredBooks: [Book] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return books.filter { book in
            switch filter {
            case .readingNow: if !book.isInProgress { return false }
            case .all: break
            case .want: if book.readingStatus != .want { return false }
            case .finished: if book.readingStatus != .finished && book.progress < 1 { return false }
            case .epub: if book.format != .epub { return false }
            case .pdf: if book.format != .pdf { return false }
            case .collection(let id): if !book.collectionIds.contains(id) { return false }
            }
            if q.isEmpty { return true }
            return book.title.lowercased().contains(q)
                || (book.author ?? "").lowercased().contains(q)
        }
    }

    var currentlyReading: [Book] {
        books.filter(\.isInProgress).sorted { $0.updatedAt > $1.updatedAt }
    }

    var heading: String {
        switch filter {
        case .readingNow: return L.readingNow
        case .all: return L.all
        case .want: return L.want
        case .finished: return L.finished
        case .epub: return L.books
        case .pdf: return L.pdfs
        case .collection(let id):
            return collections.first(where: { $0.id == id })?.name ?? L.collections
        }
    }

    func importURLs(_ urls: [URL]) {
        for url in urls {
            do {
                let book = try BookStorage.importFile(from: url)
                books.insert(book, at: 0)
            } catch {
                errorMessage = L.importFailed
            }
        }
        persist()
    }

    func open(_ book: Book) {
        openedBook = book
    }

    func update(_ book: Book) {
        if let idx = books.firstIndex(where: { $0.id == book.id }) {
            books[idx] = book
        }
        if openedBook?.id == book.id {
            openedBook = book
        }
        persist()
    }

    func setPage(_ book: Book, page: Int) {
        var next = book
        next.lastPage = max(1, min(page, max(book.pageCount, 1)))
        next.updatedAt = Date()
        update(next)
    }

    func toggleBookmark(_ book: Book, page: Int) {
        var next = book
        if let i = next.bookmarks.firstIndex(of: page) {
            next.bookmarks.remove(at: i)
        } else {
            next.bookmarks.append(page)
            next.bookmarks.sort()
        }
        update(next)
    }

    func remove(_ book: Book) {
        BookStorage.removeFiles(for: book)
        books.removeAll { $0.id == book.id }
        if openedBook?.id == book.id { openedBook = nil }
        persist()
    }

    func createCollection(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        collections.append(BookCollection(id: UUID(), name: trimmed, createdAt: Date()))
        persist()
    }

    func deleteCollection(_ id: UUID) {
        collections.removeAll { $0.id == id }
        for i in books.indices {
            books[i].collectionIds.removeAll { $0 == id }
        }
        if case .collection(let current) = filter, current == id {
            filter = .all
        }
        persist()
    }

    func toggleCollection(_ book: Book, _ collectionId: UUID) {
        var next = book
        if next.collectionIds.contains(collectionId) {
            next.collectionIds.removeAll { $0 == collectionId }
        } else {
            next.collectionIds.append(collectionId)
        }
        update(next)
    }

    func allowedTypes() -> [UTType] {
        var types: [UTType] = [.pdf]
        if let epub = UTType(filenameExtension: "epub") {
            types.append(epub)
        }
        types.append(UTType(importedAs: "org.idpf.epub-container"))
        return types
    }
}
