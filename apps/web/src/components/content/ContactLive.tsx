"use client";

import Link from "next/link";
import { useState } from "react";
import { ContactForm } from "@/components/content/ContactForm";

export function ContactLive() {
  const [mailOpen, setMailOpen] = useState(false);

  return (
    <section className="touch-card touch-live" id="contact-email">
      <header>
        <span><ChatIcon /></span>
        <div>
          <h2>Live Chat</h2>
          <p>Let&apos;s ask your questions</p>
        </div>
      </header>
      {mailOpen ? (
        <div className="touch-mail">
          <ContactForm />
        </div>
      ) : (
        <div className="touch-live-empty">
          <span><ChatIcon /></span>
          <strong>Chat with our support team in real time</strong>
          <p>Sign in to your account to start a live chat conversation with our support team.</p>
          <div>
            <Link href="/chat">
              <ChatIcon />
              Sign in to Chat
            </Link>
            <button type="button" onClick={() => setMailOpen(true)}>
              <MailIcon />
              Send Us An Email
            </button>
          </div>
          <small>You&apos;ll be brought right back here after signing in.</small>
        </div>
      )}
    </section>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 16.5 4 19.5V7.2A2.2 2.2 0 0 1 6.2 5h11.6A2.2 2.2 0 0 1 20 7.2v7.1a2.2 2.2 0 0 1-2.2 2.2H6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4.5 7.5 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
