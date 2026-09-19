"use client";

import Link from "next/link";
import { LegalDoc } from "@/components/LegalDoc";
import { useSettingsStore } from "@/store/settings";
import { SUPPORT_EMAIL } from "@/lib/site";

export default function TermsPage() {
  const locale = useSettingsStore((s) => s.locale);
  const ru = locale === "ru";

  return (
    <LegalDoc title={ru ? "Условия использования" : "Terms of use"}>
      <p className="legal-updated">
        {ru ? "Действует с 23 августа 2026" : "Effective 23 August 2026"}
      </p>
      <p>
        {ru
          ? "Сервис Étagère (Этажер) на etagere.ru — веб-читалка PDF и EPUB: полка книг, заметки и подключение вашего облачного диска. Пользуясь сайтом, вы принимаете эти условия. Если не согласны — не создавайте аккаунт и не оплачивайте подписку."
          : "Étagère at etagere.ru is a PDF/EPUB reader: a book shelf, notes, and your own cloud disk. Using the site means you accept these terms. If you do not, do not create an account or pay for a subscription."}
      </p>

      <h2>{ru ? "Аккаунт" : "Account"}</h2>
      <p>
        {ru
          ? "Регистрация доступна с 18 лет (или с согласия законного представителя). Вы отвечаете за сохранность пароля и за действия в аккаунте. Email нужно подтвердить по ссылке из письма."
          : "You must be 18 or have a guardian’s consent. You are responsible for the password and activity on the account. Confirm email via the link we send."}
      </p>

      <h2>{ru ? "Подписка и оплата" : "Subscription and payment"}</h2>
      <p>
        {ru
          ? "Новый аккаунт получает 7 дней полного доступа бесплатно. Дальше Pro стоит 100 ₽ в месяц. Оплата идёт через ЮKassa. Подписку можно отменить в кабинете — доступ сохраняется до конца уже оплаченного периода. Чеки и фискализацию обрабатывает ЮKassa, если касса подключена в магазине."
          : "A new account gets 7 days of full access free. After that, Pro is 100 ₽ per month via YooKassa. You can cancel in the account page — access lasts until the end of the paid period. Receipts, if enabled, are issued by YooKassa."}
      </p>

      <h2>{ru ? "Ваш контент" : "Your content"}</h2>
      <p>
        {ru
          ? "Книги, заметки и рисунки принадлежат вам. Вы гарантируете, что имеете право загружать эти файлы. Мы не претендуем на авторские права на ваши книги. Сервис — инструмент для чтения, а не магазин файлов."
          : "Books, notes, and drawings remain yours. You confirm you have the right to upload those files. We do not claim copyright in your books. The service is a reader, not a file store for sale."}
      </p>

      <h2>{ru ? "Облачные диски" : "Cloud disks"}</h2>
      <p>
        {ru
          ? "Подключая Google Drive или другой диск, вы даёте Étagère доступ только к выбранным файлам, чтобы открыть их в читалке. Отключить диск можно в любой момент. Правила Google, Яндекса, Dropbox и Microsoft тоже применяются к этому подключению."
          : "Connecting Google Drive or another disk grants Étagère access only to the files you pick, so we can open them in the reader. You can disconnect at any time. Google, Yandex, Dropbox, and Microsoft terms also apply to that connection."}
      </p>

      <h2>{ru ? "ИИ" : "AI"}</h2>
      <p>
        {ru
          ? "Ответы чата и перевода формирует GigaChat. Это вспомогательная функция: проверяйте факты. Не отправляйте в чат то, что нельзя передавать третьим лицам."
          : "Chat and translation answers come from GigaChat. Treat them as assistance and check facts. Do not send anything you cannot share with a processor."}
      </p>

      <h2>{ru ? "Запрещено" : "Not allowed"}</h2>
      <p>
        {ru
          ? "Ломать сервис, обходить оплату, загружать вредоносные файлы, выдавать себя за другого человека, использовать Étagère для распространения пиратского контента."
          : "Do not break the service, bypass payment, upload malware, impersonate others, or use Étagère to distribute pirated files."}
      </p>

      <h2>{ru ? "Ограничение ответственности" : "Limitation of liability"}</h2>
      <p>
        {ru
          ? "Сервис предоставляется «как есть». Мы стараемся, чтобы полка и читалка работали, но не гарантируем отсутствие сбоев и не отвечаем за потерю локальных файлов в браузере. Храните важные книги ещё и у себя. Максимальная ответственность по спору — сумма, которую вы заплатили нам за три месяца до претензии."
          : "The service is provided as is. We work to keep the shelf and reader up, but we do not guarantee zero downtime and are not liable for local browser data loss. Keep important books in your own copy too. Liability is capped at the amount you paid us in the three months before a claim."}
      </p>

      <h2>{ru ? "Изменения и право" : "Changes and law"}</h2>
      <p>
        {ru
          ? "Мы можем обновить условия, опубликовав новую редакцию на этой странице. Существенные изменения постараемся отметить датой вверху. К отношениям применяется право Российской Федерации. Споры — по месту нахождения оператора, если закон не даёт вам иного суда."
          : "We may update these terms by posting a new version here, with the date at the top. The laws of the Russian Federation apply. Disputes go to the operator’s venue unless mandatory law gives you another court."}
      </p>

      <p>
        {ru ? "См. также " : "See also "}
        <Link href="/privacy">
          {ru ? "политику конфиденциальности" : "the privacy policy"}
        </Link>
        . {ru ? "Письма — " : "Email — "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </LegalDoc>
  );
}
