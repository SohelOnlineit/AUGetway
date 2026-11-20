-- A photo-only chat message has an empty caption. Text-only messages still need a body.
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_body_len";
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_len" CHECK (
  char_length("body") <= 2000
  AND (
    char_length("body") >= 1
    OR ("imageUrl" IS NOT NULL AND char_length("body") = 0)
  )
);
