import Foundation

enum BookFormat: String, Codable, CaseIterable, Hashable {
    case pdf
    case epub
}

enum ReadingStatus: String, Codable, Hashable {
    case none
    case want
    case finished
}

struct BookCollection: Identifiable, Codable, Hashable {
    var id: UUID
    var name: String
    var createdAt: Date
}

struct Book: Identifiable, Codable, Hashable {
    var id: UUID
    var title: String
    var author: String?
    var format: BookFormat
    var pageCount: Int
    var lastPage: Int
    var fileName: String
    var coverFileName: String?
    var addedAt: Date
    var updatedAt: Date
    var readingStatus: ReadingStatus
    var collectionIds: [UUID]
    var bookmarks: [Int]
    var cloudId: String?
    var contentHash: String?
    var sizeBytes: Int

    var progress: Double {
        guard pageCount > 0 else { return 0 }
        return min(1, Double(max(lastPage, 1)) / Double(pageCount))
    }

    var isInProgress: Bool {
        readingStatus != .finished && lastPage > 1 && progress < 1
    }
}

enum LibraryFilter: Hashable {
    case readingNow
    case all
    case want
    case finished
    case epub
    case pdf
    case collection(UUID)
}

struct LibrarySnapshot: Codable {
    var books: [Book]
    var collections: [BookCollection]
}

enum ReaderTheme: String, CaseIterable, Identifiable {
    case day, paper, night
    var id: String { rawValue }
}

enum ReaderTool: String {
    case browse
    case pencil
}
