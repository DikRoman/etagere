import Foundation
import CryptoKit
import PDFKit
import UIKit

enum BookStorage {
    static var root: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Etagere", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static var booksDir: URL {
        let url = root.appendingPathComponent("Books", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static var coversDir: URL {
        let url = root.appendingPathComponent("Covers", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static var pencilDir: URL {
        let url = root.appendingPathComponent("Pencil", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static var catalogURL: URL {
        root.appendingPathComponent("library.json")
    }

    static func fileURL(for book: Book) -> URL {
        booksDir.appendingPathComponent(book.fileName)
    }

    static func coverURL(named name: String) -> URL {
        coversDir.appendingPathComponent(name)
    }

    static func loadSnapshot() -> LibrarySnapshot {
        guard let data = try? Data(contentsOf: catalogURL) else {
            return LibrarySnapshot(books: [], collections: [])
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let snap = try? decoder.decode(LibrarySnapshot.self, from: data) else {
            return LibrarySnapshot(books: [], collections: [])
        }
        return snap
    }

    static func saveSnapshot(_ snapshot: LibrarySnapshot) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(snapshot) else { return }
        try? data.write(to: catalogURL, options: .atomic)
    }

    static func importFile(from source: URL) throws -> Book {
        let accessed = source.startAccessingSecurityScopedResource()
        defer { if accessed { source.stopAccessingSecurityScopedResource() } }

        let ext = source.pathExtension.lowercased()
        let format: BookFormat = ext == "epub" ? .epub : .pdf
        let id = UUID()
        let fileName = "\(id.uuidString).\(ext.isEmpty ? (format == .epub ? "epub" : "pdf") : ext)"
        let dest = booksDir.appendingPathComponent(fileName)
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: source, to: dest)

        var title = source.deletingPathExtension().lastPathComponent
        var author: String?
        var pageCount = 1
        var coverName: String?

        if format == .pdf, let doc = PDFDocument(url: dest) {
            pageCount = max(1, doc.pageCount)
            title = doc.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String ?? title
            author = doc.documentAttributes?[PDFDocumentAttribute.authorAttribute] as? String
            if let image = CoverExtractor.pdfCover(from: dest) {
                coverName = saveCover(image, id: id)
            }
        } else if format == .epub {
            let meta = CoverExtractor.epubTitle(from: dest)
            title = meta.title
            author = meta.author
            if let image = CoverExtractor.epubCover(from: dest) {
                coverName = saveCover(image, id: id)
            }
        }

        let data = try Data(contentsOf: dest, options: .mappedIfSafe)
        let hash = SHA256.hash(data: data).compactMap { String(format: "%02x", $0) }.joined()
        let now = Date()
        return Book(
            id: id,
            title: title.isEmpty ? "Book" : title,
            author: author,
            format: format,
            pageCount: pageCount,
            lastPage: 1,
            fileName: fileName,
            coverFileName: coverName,
            addedAt: now,
            updatedAt: now,
            readingStatus: .none,
            collectionIds: [],
            bookmarks: [],
            cloudId: nil,
            contentHash: hash,
            sizeBytes: data.count
        )
    }

    static func removeFiles(for book: Book) {
        try? FileManager.default.removeItem(at: fileURL(for: book))
        if let cover = book.coverFileName {
            try? FileManager.default.removeItem(at: coverURL(named: cover))
        }
        try? FileManager.default.removeItem(at: pencilDir.appendingPathComponent(book.id.uuidString))
    }

    static func pencilURL(bookId: UUID, page: Int) -> URL {
        let dir = pencilDir.appendingPathComponent(bookId.uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(page).drawing")
    }

    private static func saveCover(_ image: UIImage, id: UUID) -> String {
        let name = "\(id.uuidString).jpg"
        if let data = image.jpegData(compressionQuality: 0.82) {
            try? data.write(to: coverURL(named: name), options: .atomic)
        }
        return name
    }
}
