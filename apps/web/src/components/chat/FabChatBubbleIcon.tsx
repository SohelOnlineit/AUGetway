/** Speech-bubble button used by the live-support launcher. */
export function FabChatBubbleIcon({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  const dotClass = animated
    ? "live-chat-fab-icon-dot"
    : "live-chat-fab-icon-dot live-chat-fab-icon-dot--static";
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ? `live-chat-fab-icon ${className}` : "live-chat-fab-icon"}
      aria-hidden
    >
      <path
        d="M7.5 4.25h9A4.75 4.75 0 0 1 21.25 9v4.2a4.75 4.75 0 0 1-4.75 4.75H12l-3.45 2.76a1 1 0 0 1-1.55-.8V18H7.5A4.75 4.75 0 0 1 2.75 13.2V9A4.75 4.75 0 0 1 7.5 4.25Z"
        fill="currentColor"
      />
      <circle className={`${dotClass} live-chat-fab-icon-dot--1`} cx="8.6" cy="11.8" r="1.05" />
      <circle className={`${dotClass} live-chat-fab-icon-dot--2`} cx="12" cy="11.8" r="1.05" />
      <circle className={`${dotClass} live-chat-fab-icon-dot--3`} cx="15.4" cy="11.8" r="1.05" />
    </svg>
  );
}
