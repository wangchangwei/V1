//@ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";
import { ChatSidebar } from "./ChatSidebar";
import { CryptoPlaceholder } from "./CryptoPlaceholder";
import { TopNavigation } from "./TopNavigation";

export const CreateDashboard = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: "user",
      content: "what is this project about?",
      timestamp: "15:20 on May 26, 2025",
    },
    {
      id: 2,
      type: "bot",
      content: `This is a **Crypto Dashboard** web application that provides a comprehensive view of cryptocurrency market data and portfolio tracking. Here's what the project includes:

## Main Features:
1. **Market Statistics** - Displays key crypto market metrics and data
2. **Interactive Charts** - Features a TradingView widget showing Bitcoin price charts with professional trading tools
3. **Portfolio Performance** - Shows Bitcoin performance over the last 6 months using a custom line chart built with Recharts
4. **Cryptocurrency List** - Displays a list of various cryptocurrencies with their current data

## Technical Stack:
- **React** with TypeScript for the frontend
- **Tailwind CSS** for styling with a dark theme
- **Shadcn/UI** components for consistent UI elements
- **TanStack Query** for data fetching and caching
- **Recharts** for custom chart visualizations
- **TradingView Widget** for professional trading charts
- **CoinGecko API** for real-time cryptocurrency data

## Design:
The dashboard features a modern dark theme with a glassmorphism design (glass-card styling), purple accent colors, and smooth animations. The layout is responsive and organized in a grid system that adapts to different screen sizes.

The app fetches live Bitcoin price data and displays it in multiple formats - both as a professional trading chart and as a simplified performance chart showing the 6-month trend.`,
      timestamp: "15:20 on May 26, 2025",
    },
  ]);

  const [inputValue, setInputValue] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const newMessage = {
      id: messages.length + 1,
      type: "user",
      content: inputValue,
      timestamp: new Date().toLocaleString(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");

    setTimeout(() => {
      const botResponse = {
        id: messages.length + 2,
        type: "bot",
        content:
          "This is a mock response. In a real application, this would connect to your backend API or AI service.",
        timestamp: new Date().toLocaleString(),
      };
      setMessages((prev) => [...prev, botResponse]);
    }, 1000);
  };

  const handleTextareaKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageContent = (content) => {
    return content.split("\n").map((line, index) => {
      if (line.startsWith("## ")) {
        return (
          <h3 key={index} className="text-lg font-semibold mt-4 mb-2">
            {line.substring(3)}
          </h3>
        );
      }
      if (line.startsWith("# ")) {
        return (
          <h2 key={index} className="text-xl font-semibold mt-4 mb-2">
            {line.substring(2)}
          </h2>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <li key={index} className="ml-4 list-disc">
            {line.substring(2)}
          </li>
        );
      }
      if (line.match(/^\d+\./)) {
        const match = line.match(/^(\d+\.)\s*(.*)$/);
        return (
          <li key={index} className="ml-4 list-decimal">
            {match[2]}
          </li>
        );
      }
      if (line.includes("**") && line.includes("**")) {
        const parts = line.split("**");
        return (
          <p key={index} className="mb-2">
            {parts.map((part, i) =>
              i % 2 === 1 ? <strong key={i}>{part}</strong> : part
            )}
          </p>
        );
      }
      return line ? (
        <p key={index} className="mb-2">
          {line}
        </p>
      ) : (
        <br key={index} />
      );
    });
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      <div className="flex flex-col w-full">
        <TopNavigation
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />

        <div className="flex min-h-0 flex-1">
          {sidebarOpen && (
            <ChatSidebar
              messages={messages}
              inputValue={inputValue}
              setInputValue={setInputValue}
              onSendMessage={handleSendMessage}
              messagesEndRef={messagesEndRef}
              textareaRef={textareaRef}
              onKeyDown={handleTextareaKeyDown}
              formatMessageContent={formatMessageContent}
            />
          )}

          <CryptoPlaceholder />
        </div>
      </div>
    </div>
  );
};

export default CreateDashboard;
