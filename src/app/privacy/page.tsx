"use client";

import Link from "next/link";
import { LegalDoc } from "@/components/LegalDoc";
import { useSettingsStore } from "@/store/settings";
import { SUPPORT_EMAIL } from "@/lib/site";

export default function PrivacyPage() {
  const locale = useSettingsStore((s) => s.locale);
  const ru = locale === "ru";

  return (
    <LegalDoc title={ru ? "Политика конфиденциальности" : "Privacy policy"}>
      <p className="legal-updated">
        {ru ? "Действует с 23 августа 2026" : "Effective 23 August 2026"}
      </p>
      <p>
        {ru
          ? "Эта политика объясняет, какие данные обрабатывает сервис Étagère (Этажер) на etagere.ru и зачем. Оператор сервиса — администрация Étagère, контакт:"
          : "This policy explains what data the Étagère service at etagere.ru processes and why. The service is operated by the Étagère team. Contact:"}{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>{ru ? "Какие данные мы обрабатываем" : "What we process"}</h2>
      <ul>
        <li>
          {ru
            ? "Аккаунт: имя, email, фото профиля, если вы его загрузили; вход через email/пароль, VK ID, Яндекс ID или Telegram."
            : "Account: name, email, profile photo if you upload one; sign-in via email/password, VK ID, Yandex ID, or Telegram."}
        </li>
        <li>
          {ru
            ? "Подписка и платежи: статус тарифа, даты пробного периода и оплаты. Карты и деньги обрабатывает ЮKassa — мы не храним полные данные карты."
            : "Subscription and payments: plan status, trial and billing dates. Cards and charges are handled by YooKassa — we do not store full card details."}
        </li>
        <li>
          {ru
            ? "Книги и заметки: файлы PDF/EPUB, прогресс, закладки, выделения и рисунки хранятся в вашем браузере. На сервер уходит служебная копия библиотеки (названия, прогресс, облачные ссылки), чтобы полка открывалась на другом устройстве после входа."
            : "Books and notes: PDF/EPUB files, progress, bookmarks, highlights, and drawings stay in your browser. The server keeps a library index (titles, progress, cloud file refs) so the shelf can open on another device after you sign in."}
        </li>
        <li>
          {ru
            ? "Облачные диски (Google Drive, Яндекс Диск, Dropbox, OneDrive): доступ только к файлам, которые вы сами выбираете. Мы не просим доступ ко всему диску."
            : "Cloud disks (Google Drive, Yandex Disk, Dropbox, OneDrive): access only to files you pick. We do not ask for your entire disk."}
        </li>
        <li>
          {ru
            ? "ИИ: текст, который вы отправляете в перевод или чат, уходит в GigaChat (Сбер), чтобы получить ответ. Словарные запросы не лимитируются отдельно от чата."
            : "AI: text you send for translation or chat goes to GigaChat (Sber) to produce a reply."}
        </li>
        <li>
          {ru
            ? "Рассылка: email, если вы подписались в подвале сайта — только после подтверждения ссылкой из письма."
            : "Newsletter: email if you subscribe in the footer — only after you confirm the link in the message."}
        </li>
        <li>
          {ru
            ? "Технические журналы сервера: IP, время запроса, ошибки — чтобы чинить сервис и защищаться от злоупотреблений."
            : "Server logs: IP, request time, errors — to keep the service running and resist abuse."}
        </li>
      </ul>

      <h2>{ru ? "Google Drive" : "Google Drive"}</h2>
      <p>
        {ru
          ? "Подключение Drive нужно, чтобы вы могли выбрать PDF или EPUB в окне Google и открыть книгу в Étagère. Мы запрашиваем право только на файлы, которые вы открыли или создали через приложение (drive.file). Файлы скачиваются к вам в браузер. Мы не читаем остальные файлы на диске и не продаём доступ к ним."
          : "Drive access lets you pick a PDF or EPUB in the Google picker and open it in Étagère. We request access only to files you open or create with the app (drive.file). Files download into your browser. We do not read the rest of your Drive and do not sell that access."}
      </p>

      <h2>{ru ? "Зачем это нужно" : "Why we need it"}</h2>
      <p>
        {ru
          ? "Данные аккаунта — чтобы войти и показать вашу полку. Платежные сведения — чтобы вести пробный период и подписку Pro. Текст для ИИ — чтобы ответить на запрос. Рассылка — только если вы сами подписались."
          : "Account data is for sign-in and your shelf. Billing data is for the trial and Pro subscription. AI text is to answer your request. The newsletter is only if you opt in."}
      </p>

      <h2>{ru ? "Кому передаём" : "Who we share with"}</h2>
      <p>
        {ru
          ? "Подво подрядчики, без которых сервис не работает: хостинг, PocketBase на нашем сервере, ЮKassa (оплата), GigaChat (ИИ), почтовый сервис для писем, и тот облачный диск, который вы сами подключили. Мы не продаём персональные данные и не передаём их для чужой рекламы."
          : "Only processors the service needs: hosting, PocketBase on our server, YooKassa (payments), GigaChat (AI), email delivery, and the cloud disk you connect. We do not sell personal data or share it for third-party ads."}
      </p>

      <h2>{ru ? "Срок хранения и ваши права" : "Retention and your rights"}</h2>
      <p>
        {ru
          ? "Аккаунт и индекс библиотеки хранятся, пока вы пользуетесь сервисом. Книги в браузере вы можете удалить с полки в любой момент. Рассылку можно отменить из письма. Чтобы удалить аккаунт или запросить данные, напишите на"
          : "The account and library index stay while you use the service. You can remove books from the shelf at any time. You can unsubscribe from the newsletter via the email. To delete the account or request a copy of your data, write to"}{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>{ru ? "Cookies и локальные данные" : "Cookies and local data"}</h2>
      <p>
        {ru
          ? "Мы используем локальное хранилище браузера для сессии, настроек читалки и файлов книг. Это нужно, чтобы сервис работал, а не для слежки за сайтами."
          : "We use browser storage for the session, reader settings, and book files. This is to run the product, not to track you across other sites."}
      </p>

      <p>
        {ru ? "См. также " : "See also "}
        <Link href="/terms">
          {ru ? "условия использования" : "terms of use"}
        </Link>
        .
      </p>
    </LegalDoc>
  );
}
