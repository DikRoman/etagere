import Foundation
import PDFKit
import UIKit

enum CoverExtractor {
    static func pdfCover(from url: URL) -> UIImage? {
        guard let document = PDFDocument(url: url), let page = document.page(at: 0) else {
            return nil
        }
        let bounds = page.bounds(for: .mediaBox)
        let scale = 400 / max(bounds.width, 1)
        let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
        return page.thumbnail(of: size, for: .mediaBox)
    }

    static func epubCover(from url: URL) -> UIImage? {
        guard let entries = try? ZipReader.entries(in: url) else { return nil }
        let preferred = entries.filter { entry in
            let name = entry.name.lowercased()
            guard !name.hasSuffix("/") else { return false }
            return name.contains("cover") && (
                name.hasSuffix(".jpg") || name.hasSuffix(".jpeg") ||
                name.hasSuffix(".png") || name.hasSuffix(".webp")
            )
        }
        let fallback = entries.filter { entry in
            let name = entry.name.lowercased()
            return name.hasSuffix(".jpg") || name.hasSuffix(".jpeg") || name.hasSuffix(".png")
        }
        for entry in preferred + fallback {
            if let data = try? ZipReader.extract(entry: entry, from: url),
               let image = UIImage(data: data)
            {
                return image
            }
        }
        return nil
    }

    static func epubTitle(from url: URL) -> (title: String, author: String?) {
        guard let entries = try? ZipReader.entries(in: url) else {
            return (url.deletingPathExtension().lastPathComponent, nil)
        }
        let opf = entries.first { $0.name.lowercased().hasSuffix(".opf") }
        if let opf, let data = try? ZipReader.extract(entry: opf, from: url),
           let xml = String(data: data, encoding: .utf8)
        {
            let title = firstTag("dc:title", in: xml) ?? url.deletingPathExtension().lastPathComponent
            let author = firstTag("dc:creator", in: xml)
            return (title, author)
        }
        return (url.deletingPathExtension().lastPathComponent, nil)
    }

    private static func firstTag(_ name: String, in xml: String) -> String? {
        guard let start = xml.range(of: "<\(name)", options: .caseInsensitive),
              let close = xml.range(of: ">", range: start.upperBound..<xml.endIndex),
              let end = xml.range(of: "</\(name)>", options: .caseInsensitive, range: close.upperBound..<xml.endIndex)
        else { return nil }
        let raw = xml[close.upperBound..<end.lowerBound]
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return raw.isEmpty ? nil : raw
    }
}
