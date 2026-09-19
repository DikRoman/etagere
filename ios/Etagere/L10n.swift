import Foundation

enum L {
    static var isRussian: Bool {
        if let stored = UserDefaults.standard.string(forKey: "etagere.locale") {
            return stored == "ru"
        }
        return Locale.current.language.languageCode?.identifier == "ru"
    }

    static func setRussian(_ on: Bool) {
        UserDefaults.standard.set(on ? "ru" : "en", forKey: "etagere.locale")
    }

    static func t(_ ru: String, _ en: String) -> String {
        isRussian ? ru : en
    }

    static var library: String { t("Библиотека", "Library") }
    static var readingNow: String { t("Читаю сейчас", "Reading Now") }
    static var currentlyReading: String { t("Сейчас читаю", "Currently Reading") }
    static var all: String { t("Все", "All") }
    static var want: String { t("Хочу прочесть", "Want to Read") }
    static var finished: String { t("Законченные", "Finished") }
    static var books: String { t("Книги", "Books") }
    static var pdfs: String { t("Файлы PDF", "PDF Files") }
    static var collections: String { t("Коллекции", "Collections") }
    static var newCollection: String { t("Новая коллекция", "New Collection") }
    static var addBook: String { t("Добавить книгу", "Add Book") }
    static var continueReading: String { t("Продолжить", "Continue") }
    static var emptyShelf: String { t("Полка пуста", "Your library is empty") }
    static var readingNowEmpty: String {
        t("Открой книгу с полки — она появится здесь.", "Open a book and it will show up here.")
    }
    static var account: String { t("Аккаунт", "Account") }
    static var signIn: String { t("Войти", "Sign In") }
    static var signOut: String { t("Выйти", "Sign Out") }
    static var email: String { t("Email", "Email") }
    static var password: String { t("Пароль", "Password") }
    static var syncing: String { t("Синхронизация…", "Syncing…") }
    static var synced: String { t("Синхронизировано", "Synced") }
    static var appearance: String { t("Оформление", "Appearance") }
    static var markup: String { t("Пометки", "Markup") }
    static var bookmark: String { t("Закладка", "Bookmark") }
    static var spread: String { t("Разворот", "Two Pages") }
    static var themeDay: String { t("День", "Day") }
    static var themePaper: String { t("Бумага", "Paper") }
    static var themeNight: String { t("Ночь", "Night") }
    static var unknownAuthor: String { t("Без автора", "Unknown author") }
    static var settings: String { t("Настройки", "Settings") }
    static var server: String { t("Сервер PocketBase", "PocketBase server") }
    static var language: String { t("Язык", "Language") }
    static var close: String { t("Закрыть", "Close") }
    static var importFailed: String { t("Не удалось добавить книгу", "Could not add the book") }
    static var recentlyAdded: String { t("Недавно добавленные", "Recently Added") }
    static var contents: String { t("Оглавление", "Contents") }
}
