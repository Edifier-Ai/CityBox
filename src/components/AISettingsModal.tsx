import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { AIConfig } from '../types/city';

interface AISettingsModalProps {
  open: boolean;
  config: AIConfig;
  onClose: () => void;
  onSave: (next: AIConfig) => void;
}

export function AISettingsModal({ open, config, onClose, onSave }: AISettingsModalProps) {
  const [draft, setDraft] = useState<AIConfig>(config);

  if (!open) return null;

  return (
    <div className="pc-modal-backdrop" role="dialog" aria-modal="true" aria-label="AI 策展设置">
      <div className="pc-modal narrow">
        <div className="pc-modal-header">
          <div className="pc-modal-title-row">
            <div className="pc-modal-icon">
              <Sparkles size={16} />
            </div>
            <h2 className="pc-modal-title">AI 地理策展增强（可选）</h2>
          </div>
          <button onClick={onClose} className="pc-icon-close" aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="pc-modal-body" style={{ gap: 14 }}>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: '#475569' }}>
            开启后，在探索任意新地点时，将自动调用大模型分析该区域的古建地标原型（廊桥、亭台、塔楼）并撰写诗意人文短评。Key 仅保存在本地浏览器 localStorage。
          </p>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>启用 AI 策展</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#14161a' }}
            />
          </label>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#475569' }}>
              模型接口协议
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['openai', 'gemini'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      provider: p,
                      apiBaseUrl:
                        p === 'gemini'
                          ? 'https://generativelanguage.googleapis.com/v1beta'
                          : 'https://api.openai.com/v1',
                      model: p === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini',
                    })
                  }
                  style={{
                    padding: '8px 10px',
                    borderRadius: 9,
                    border: draft.provider === p ? '1px solid #14161a' : '1px solid #e2e8f0',
                    background: draft.provider === p ? '#14161a' : '#ffffff',
                    color: draft.provider === p ? '#ffffff' : '#475569',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {p === 'openai' ? 'OpenAI 兼容格式' : 'Google Gemini'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#475569' }}>
              API Base URL
            </div>
            <input
              type="text"
              value={draft.apiBaseUrl}
              onChange={(e) => setDraft({ ...draft, apiBaseUrl: e.target.value })}
              className="pc-input"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#475569' }}>
              模型名称
            </div>
            <input
              type="text"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className="pc-input"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#475569' }}>
              API Key
            </div>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-... 或 AIza..."
              className="pc-input"
            />
          </div>
        </div>

        <div className="pc-modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="pc-btn-secondary">
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="pc-btn-primary"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
