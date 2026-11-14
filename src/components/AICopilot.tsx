import React, { useState } from 'react';
import { Sparkles, Send, X, Bot, User, Loader2 } from 'lucide-react';
import { ComfyNodeData, ComfyLink, AIProviderConfig } from '../types';
import { apiUrl } from '../api';
import { useT } from '../i18n';

interface AICopilotProps {
  isOpen: boolean;
  onClose: () => void;
  workflowContext: { nodes: ComfyNodeData[]; links: ComfyLink[] };
  onAddGeneratedNode: (node: ComfyNodeData) => void;
  aiConfig: AIProviderConfig;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AICopilot: React.FC<AICopilotProps> = ({
  isOpen,
  onClose,
  workflowContext,
  onAddGeneratedNode,
  aiConfig,
}) => {
  const tr = useT();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: tr('copilotGreeting'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setInput('');
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/copilot/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          workflowContext,
          history: messages,
          providerConfig: aiConfig,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `${tr('aiError')}: ${data.error || 'Failed to get response.'}` },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `${tr('networkError')}: ${err.message || 'Could not connect to AI backend.'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNodeByAI = async (promptText: string) => {
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: `Generate custom node: "${promptText}"` }]);
    try {
      const res = await fetch(apiUrl('/api/copilot/generate-node'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, providerConfig: aiConfig }),
      });
      const data = await res.json();
      if (data.success && data.node) {
        const genNode = data.node;
        const newNode: ComfyNodeData = {
          id: 'node_' + Math.random().toString(36).substring(2, 9),
          type: genNode.name.replace(/\s+/g, ''),
          title: genNode.name,
          category: 'custom',
          style: 'neon',
          position: { x: 300 + Math.random() * 100, y: 200 + Math.random() * 100 },
          size: { width: 300, height: 200 },
          inputs: (genNode.inputs || []).map((i: any) => ({ name: i.name, type: i.type })),
          outputs: (genNode.outputs || []).map((o: any) => ({ name: o.name, type: o.type })),
          widgets: (genNode.inputs || []).map((i: any) => ({
            name: i.name,
            type: i.type === 'INT' ? 'INT' : i.type === 'FLOAT' ? 'FLOAT' : 'STRING',
            value: i.default || 'default',
          })),
          customCode: genNode.pythonCode,
        };
        onAddGeneratedNode(newNode);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I've successfully generated the custom node **${genNode.name}** and added it directly to your canvas!`,
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Failed to generate custom node spec.' }]);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error generating node: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed right-0 top-16 bottom-0 w-full sm:w-96 bg-slate-900/95 border-l border-slate-800 shadow-2xl z-50 flex flex-col backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{tr('copilotTitle')}</h3>
            <p className="text-[10px] text-slate-400">{tr('copilotSub')}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Action Chips */}
      <div className="p-3 bg-slate-950/30 border-b border-slate-800 flex gap-2 overflow-x-auto">
        <button
          onClick={() => handleSend("Debug my current workflow for missing inputs or broken connections.")}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-[11px] font-medium whitespace-nowrap border border-slate-700/50 transition-colors"
        >
          🔍 {tr('debugPipeline')}
        </button>
        <button
          onClick={() => handleGenerateNodeByAI("Face restoration upscale node with CodeFormer")}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-[11px] font-medium whitespace-nowrap border border-slate-700/50 transition-colors"
        >
          ✨ {tr('generateFaceRestore')}
        </button>
        <button
          onClick={() => handleSend("Explain how data flows from LoadCheckpoint through KSampler to VAE Decode.")}
          className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-[11px] font-medium whitespace-nowrap border border-slate-700/50 transition-colors"
        >
          📖 {tr('explainWorkflow')}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-400 border border-slate-700'
              }`}
            >
              {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div
              className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[80%] ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-slate-800/80 border border-slate-700/60 text-slate-200 rounded-tl-none font-mono'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-800 text-indigo-400 border border-slate-700 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-slate-400 text-xs flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>{tr('copilotLoading')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={tr('askPlaceholder')}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
