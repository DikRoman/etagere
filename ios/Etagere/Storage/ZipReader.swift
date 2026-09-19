import Foundation

struct ZipEntry {
    let name: String
    let dataOffset: Int
    let compressedSize: Int
    let uncompressedSize: Int
    let method: UInt16
}

enum ZipReader {
    static func entries(in url: URL) throws -> [ZipEntry] {
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count >= 22 else { return [] }
        var scan = data.count - 22
        let floor = max(0, data.count - 22 - 65_535)
        var eocd: Int?
        while scan >= floor {
            if data.u32(at: scan) == 0x06054B50 {
                eocd = scan
                break
            }
            scan -= 1
        }
        guard let eocd else { return [] }
        let count = Int(data.u16(at: eocd + 10))
        var offset = Int(data.u32(at: eocd + 16))
        var list: [ZipEntry] = []
        for _ in 0..<count {
            guard offset + 46 <= data.count, data.u32(at: offset) == 0x02014B50 else { break }
            let method = data.u16(at: offset + 10)
            let comp = Int(data.u32(at: offset + 20))
            let uncomp = Int(data.u32(at: offset + 24))
            let nameLen = Int(data.u16(at: offset + 28))
            let extraLen = Int(data.u16(at: offset + 30))
            let commentLen = Int(data.u16(at: offset + 32))
            let localHeader = Int(data.u32(at: offset + 42))
            let nameStart = offset + 46
            let name = String(
                data: data.subdata(in: nameStart..<(nameStart + nameLen)),
                encoding: .utf8
            ) ?? ""
            let localExtra = Int(data.u16(at: localHeader + 28))
            let localName = Int(data.u16(at: localHeader + 26))
            let dataOffset = localHeader + 30 + localName + localExtra
            list.append(
                ZipEntry(
                    name: name,
                    dataOffset: dataOffset,
                    compressedSize: comp,
                    uncompressedSize: uncomp,
                    method: method
                )
            )
            offset += 46 + nameLen + extraLen + commentLen
        }
        return list
    }

    static func extract(entry: ZipEntry, from url: URL) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(entry.dataOffset))
        let payload = handle.readData(ofLength: entry.compressedSize)
        if entry.method == 0 { return payload }
        if entry.method == 8 {
            if let inflated = inflate(payload, size: entry.uncompressedSize) {
                return inflated
            }
        }
        throw CocoaError(.fileReadCorruptFile)
    }

    private static func inflate(_ source: Data, size: Int) -> Data? {
        var zlib = Data([0x78, 0x9C])
        zlib.append(source)
        return try? (zlib as NSData).decompressed(using: .zlib) as Data
    }
}

private extension Data {
    func u16(at offset: Int) -> UInt16 {
        guard offset + 1 < count else { return 0 }
        return UInt16(self[offset]) | UInt16(self[offset + 1]) << 8
    }

    func u32(at offset: Int) -> UInt32 {
        guard offset + 3 < count else { return 0 }
        return UInt32(self[offset])
            | UInt32(self[offset + 1]) << 8
            | UInt32(self[offset + 2]) << 16
            | UInt32(self[offset + 3]) << 24
    }
}
