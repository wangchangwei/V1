//@ts-nocheck

import { ChatInput } from "./ChatInput";
import { ChatMessage } from "./ChatMessage";

export const ChatSidebar = ({
  messages,
  inputValue,
  setInputValue,
  onSendMessage,
  messagesEndRef,
  textareaRef,
  onKeyDown,
  formatMessageContent,
}) => {
  return (
    <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="flex-1 custom-scrollbar overflow-y-auto p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              formatMessageContent={formatMessageContent}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput
        inputValue={inputValue}
        setInputValue={setInputValue}
        onSendMessage={onSendMessage}
        textareaRef={textareaRef}
        onKeyDown={onKeyDown}
      />
    </div>
  );
};
