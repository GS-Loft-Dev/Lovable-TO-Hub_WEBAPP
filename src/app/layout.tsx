import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lovable → HubSpot",
  description: "Turn a Lovable project into an editable HubSpot CMS theme.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
