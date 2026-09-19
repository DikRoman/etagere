import SwiftUI
import UIKit

struct BookCoverView: View {
    let book: Book
    var width: CGFloat = 140

    var body: some View {
        let height = width * 1.5
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(Color.black.opacity(0.18))
                .frame(width: 8, height: height)
                .offset(x: -5)
            Group {
                if let name = book.coverFileName,
                   let ui = UIImage(contentsOfFile: BookStorage.coverURL(named: name).path)
                {
                    Image(uiImage: ui)
                        .resizable()
                        .scaledToFill()
                } else {
                    LinearGradient(
                        colors: [Color(hue: hue, saturation: 0.35, brightness: 0.38),
                                 Color(hue: hue, saturation: 0.4, brightness: 0.22)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .overlay(alignment: .bottomLeading) {
                        Text(book.title)
                            .font(.system(.caption, design: .serif).weight(.semibold))
                            .foregroundStyle(.white.opacity(0.92))
                            .padding(10)
                            .lineLimit(4)
                    }
                }
            }
            .frame(width: width, height: height)
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color.accentColor)
                    .frame(width: width * book.progress, height: 3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(width: width, height: height)
        .shadow(color: .black.opacity(0.28), radius: 10, y: 8)
    }

    private var hue: Double {
        Double(abs(book.title.hashValue % 360)) / 360
    }
}
