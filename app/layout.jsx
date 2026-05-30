import './globals.css';
import ScrollEffects from '@/components/ScrollEffects';

export const metadata = {
  title: 'Aether',
  description: 'A personal operating system powered by Coral.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ScrollEffects />
        <div id="smooth-wrapper">
          <div id="smooth-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
