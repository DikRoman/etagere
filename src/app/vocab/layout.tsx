import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Словарь · Étagère",
};

export default function VocabLayout({ children }: LayoutProps<"/vocab">) {
  return children;
}
