import SwiftUI

struct ReadingNowView: View {
    @EnvironmentObject private var library: LibraryStore

    var body: some View {
        let current = library.currentlyReading
        if let hero = current.first {
            VStack(alignment: .leading, spacing: 18) {
                Button {
                    library.open(hero)
                } label: {
                    HStack(alignment: .top, spacing: 20) {
                        BookCoverView(book: hero, width: 120)
                        VStack(alignment: .leading, spacing: 8) {
                            Text(L.currentlyReading.uppercased())
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .tracking(0.8)
                            Text(hero.title)
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(.primary)
                                .multilineTextAlignment(.leading)
                            Text(hero.author ?? L.unknownAuthor)
                                .foregroundStyle(.secondary)
                            ProgressView(value: hero.progress)
                                .tint(.accentColor)
                            Text(L.continueReading)
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(Color.accentColor, in: Capsule())
                                .foregroundStyle(.white)
                                .padding(.top, 4)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(18)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                }
                .buttonStyle(.plain)

                if current.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(current.dropFirst()) { book in
                                Button { library.open(book) } label: {
                                    VStack(alignment: .leading, spacing: 8) {
                                        BookCoverView(book: book, width: 78)
                                        Text(book.title)
                                            .font(.caption)
                                            .lineLimit(2)
                                            .frame(width: 78, alignment: .leading)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 2)
                    }
                }
            }
        }
    }
}
