import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';


export const metadata: Metadata = {
   title: { template: '%s · Scout', default: 'Scout' },
   description: 'Creator discovery and deal prediction for Prenew.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
   return (
      <html lang="en" className={`dark ${GeistSans.variable}`} style={{ colorScheme: 'dark' }}>
         <body className="bg-background font-sans antialiased">
            {children}
            <Toaster theme="dark" />
         </body>
      </html>
   );
}
