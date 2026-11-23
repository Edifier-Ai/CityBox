import { useEffect, useState } from 'react';
import { BookOpen, Download, Plus, Trash2, X } from 'lucide-react';
import type { PostcardSnapshot } from '../types/city';

interface PostcardModalProps {
  open: boolean;
  snapshots: PostcardSnapshot[];
  currentDraft: {
    title: string;
    subtitle: string;
    coordsText: string;
    atmosphereLabel: string;
    defaultNote: string;
    dataUrl: string | null;
  } | null;
  onClose: () => void;
  onSaveSnapshot: (note: string) => void;
  onDeleteSnapshot: (id: string) => void;
}

async function exportPostcardPng(snap: PostcardSnapshot): Promise<void> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = snap.dataUrl;
  });

  const W = 1280;
  const H = 900;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  const imgX = 56;
  const imgY = 56;
  const imgW = W - 112;
  const imgH = 610;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(imgX, imgY, imgW, imgH, 12);
  ctx.clip();

  const scale = Math.max(imgW / img.width, imgH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, imgX + (imgW - drawW) / 2, imgY + (imgH - drawH) / 2, drawW, drawH);
  ctx.restore();

  ctx.fillStyle = '#14161a';
  ctx.font = 'bold 42px "Noto Serif SC", Georgia, serif';
  ctx.fillText(snap.title, 60, 738);

  ctx.fillStyle = '#475569';
  ctx.font = '22px "Noto Sans SC", sans-serif';
  ctx.fillText(`${snap.subtitle}  ·  ${snap.atmosphereLabel}`, 60, 778);

  ctx.fillStyle = '#64748b';
  ctx.font = '20px "Noto Sans SC", sans-serif';
  ctx.fillText(snap.note || '在此刻驻足，留下一段城市微缩记忆。', 60, 822);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#2563eb';
  ctx.font = 'bold 20px "Inter", "Noto Sans SC", sans-serif';
  ctx.fillText('CityBox · 城市微缩取景', W - 60, 732);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px monospace';
  ctx.fillText(snap.coordsText, W - 60, 768);
  ctx.fillText(new Date(snap.createdAt).toLocaleDateString('zh-CN'), W - 60, 800);

  const link = document.createElement('a');
  link.download = `citybox-${snap.title}-${snap.id.slice(-4)}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function PostcardModal({
  open,
  snapshots,
  currentDraft,
  onClose,
  onSaveSnapshot,
  onDeleteSnapshot,
}: PostcardModalProps) {
  const [noteInput, setNoteInput] = useState(currentDraft?.defaultNote ?? '');

  useEffect(() => {
    if (open && currentDraft) {
      setNoteInput(currentDraft.defaultNote);
    }
  }, [open, currentDraft?.title, currentDraft?.subtitle]);

  if (!open) return null;

  return (
    <div className="pc-modal-backdrop" role="dialog" aria-modal="true" aria-label="取景笔记">
      <div className="pc-modal" style={{ maxWidth: 860 }}>
        <div className="pc-modal-header">
          <div className="pc-modal-title-row">
            <div className="pc-modal-icon">
              <BookOpen size={17} />
            </div>
            <div>
              <h2 className="pc-modal-title">取景册 · 城市明信片</h2>
              <p className="pc-modal-sub">
                定格当前镜头视角，记录季节光影与街区短评，并可导出高清 PNG
              </p>
            </div>
          </div>
          <button onClick={onClose} className="pc-icon-close" aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="pc-modal-body">
          {currentDraft && currentDraft.dataUrl && (
            <div className="pc-draft-box">
              <img
                src={currentDraft.dataUrl}
                alt={currentDraft.title}
                className="pc-draft-img"
              />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        background: 'rgba(37, 99, 235, 0.08)',
                        color: '#2563eb',
                        padding: '2px 9px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {currentDraft.atmosphereLabel}
                    </span>
                    <span className="font-mono" style={{ fontSize: 11, color: '#94a3b8' }}>
                      {currentDraft.coordsText}
                    </span>
                  </div>
                  <h3 className="font-serif" style={{ margin: '8px 0 2px', fontSize: 22, color: '#14161a' }}>
                    {currentDraft.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{currentDraft.subtitle}</p>
                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    rows={3}
                    placeholder="写下一句此刻的取景感受..."
                    className="pc-input"
                    style={{ marginTop: 10, resize: 'none', fontSize: 12 }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onSaveSnapshot(noteInput || currentDraft.defaultNote)}
                  className="pc-btn-primary"
                  style={{ width: '100%', marginTop: 10 }}
                >
                  <Plus size={15} />
                  收入取景册
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 10 }}>
              已收藏的明信片 ({snapshots.length})
            </div>
            {snapshots.length === 0 ? (
              <div
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: 12,
                  padding: '32px 16px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#64748b',
                  background: '#f8fafc',
                }}
              >
                还没有保存的取景，点击上方“收入取景册”即可制作你的第一张城市明信片。
              </div>
            ) : (
              <div className="pc-gallery-grid">
                {snapshots.map((snap) => (
                  <div key={snap.id} className="pc-postcard-item">
                    <div className="pc-postcard-thumb">
                      <img src={snap.dataUrl} alt={snap.title} />
                      <span
                        style={{
                          position: 'absolute',
                          left: 10,
                          top: 10,
                          background: 'rgba(255,255,255,0.92)',
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {snap.atmosphereLabel}
                      </span>
                    </div>
                    <div style={{ padding: 12 }}>
                      <div className="font-serif" style={{ fontSize: 15, fontWeight: 700, color: '#14161a' }}>
                        {snap.title} ·{' '}
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>
                          {snap.subtitle}
                        </span>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#475569' }}>{snap.note}</p>
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 8,
                          borderTop: '1px solid #e2e8f0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span className="font-mono" style={{ fontSize: 10, color: '#94a3b8' }}>
                          {snap.coordsText}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => void exportPostcardPng(snap)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              borderRadius: 7,
                              background: '#14161a',
                              color: '#ffffff',
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            <Download size={12} />
                            导出高清 PNG
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSnapshot(snap.id)}
                            className="pc-icon-close"
                            style={{ width: 26, height: 26 }}
                            aria-label="删除"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
