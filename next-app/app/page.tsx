import Image from "next/image";
import styles from "./page.module.css";

import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main style={{ padding: '2rem', maxWidth: 800, margin: 'auto', textAlign: 'center' }}>
      <h1>Welcome to Web Hisab</h1>
      <p>Track and manage your expenses with ease.</p>
      <nav style={{ marginTop: '2rem' }}>
        <Link href="/about" style={{ margin: '0 1rem' }}>About</Link>
        <Link href="/privacy-policy" style={{ margin: '0 1rem' }}>Privacy Policy</Link>
        <Link href="/terms-and-conditions" style={{ margin: '0 1rem' }}>Terms & Conditions</Link>
      </nav>
    </main>
  );
}
