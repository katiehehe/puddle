import { useCallback, useEffect, useState } from "react";
import { ClosetPiece, editPurchase } from "./api";
import { Garment } from "./Garment";

const round = (n: number) => `$${Math.round(n).toLocaleString()}`;
const money = (n: number) => `$${n.toFixed(2)}`;

const EDIT_FIELDS = ["title", "price", "brand", "size", "color", "notes"] as const;

/** One piece, opened up. The grid shows a thumbnail and a name because that is
 *  what you scan; everything Puddle knows lives here, one click in, where it
 *  can be read properly instead of crowding the shelf.
 *
 *  Left and right move through the closet in the order it is displayed, so
 *  looking through your things feels like looking through your things rather
 *  than opening and closing a series of dialogs.
 *
 *  Only things the user typed in (piece.yours) can be edited: the seeded
 *  catalog has no purchase record behind it for an edit to land on. */
export function ItemDetail({
  piece, index, total, onPrev, onNext, onClose, onWear, onRemove, onSaved,
}: {
  piece: ClosetPiece;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onWear: (id: string) => void;
  onRemove: (id: string) => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const key = useCallback((e: KeyboardEvent) => {
    if (editing) return;
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowLeft") onPrev();
    if (e.key === "ArrowRight") onNext();
  }, [editing, onClose, onPrev, onNext]);

  useEffect(() => {
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [key]);

  // A new piece coming in through left/right should not keep the last one's
  // half-finished edit open.
  useEffect(() => setEditing(false), [piece.id]);

  const cpw = piece.cost_per_wear;
  const kept = Math.round(piece.value_retained * 100);

  function startEdit() {
    setDraft({
      title: piece.title, price: String(piece.paid), brand: piece.brand,
      size: piece.size ?? "", color: piece.color, notes: piece.notes,
    });
    setError("");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await editPurchase(piece.id, {
        title: draft.title.trim(),
        price: Number(draft.price) || 0,
        brand: draft.brand.trim(),
        size: draft.size.trim() || undefined,
        color: draft.color.trim(),
        notes: draft.notes.trim(),
      });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detailwrap" role="dialog" aria-label={piece.title} onClick={onClose}>
      <button className="detailnav left" onClick={(e) => { e.stopPropagation(); onPrev(); }}
              aria-label="Previous item">‹</button>

      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <button className="xbtn detailclose" onClick={onClose} aria-label="Close">×</button>

        <div className="detailpic">
          {piece.photo
            ? <img src={piece.photo} alt="" />
            : <Garment category={piece.category} colour={piece.color || "grey"} kind={piece.kind} />}
        </div>

        {editing ? (
          <div className="detailbody editform">
            {EDIT_FIELDS.map((f) => (
              <label key={f}>
                <span>{f === "notes" ? "Notes" : f[0].toUpperCase() + f.slice(1)}</span>
                {f === "notes" ? (
                  <textarea rows={3} value={draft[f] ?? ""}
                            onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                ) : (
                  <input value={draft[f] ?? ""}
                         inputMode={f === "price" ? "decimal" : undefined}
                         onChange={(e) => setDraft({ ...draft, [f]: e.target.value })} />
                )}
              </label>
            ))}
            {error && <p className="formerror">{error}</p>}
            <div className="editbtns">
              <button className="cta small" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="ghost small" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="detailbody">
            <div className="detailhead">
              <h3>{piece.title}</h3>
              {piece.yours && <button className="ghost small" onClick={startEdit}>Edit</button>}
            </div>
            <p className="piecemeta">
              {[piece.brand, piece.size ? `size ${piece.size}` : "", piece.color, piece.material]
                .filter(Boolean).join(" · ")}
            </p>

            <p className="detailverdict">{piece.verdict}</p>

            <div className="detailfacts">
              <div>
                <span>Times worn</span>
                <b>{piece.wears}</b>
              </div>
              <div>
                <span>Cost per wear</span>
                <b className={cpw !== null && cpw > 20 ? "bad" : cpw !== null && cpw < 5 ? "good" : ""}>
                  {cpw === null ? "not worn yet" : money(cpw)}
                </b>
              </div>
              <div>
                <span>You paid</span>
                <b>{round(piece.paid)}</b>
              </div>
              <div>
                <span>Worth now</span>
                <b>{round(piece.worth_now)}</b>
              </div>
              <div>
                <span>Value kept</span>
                <b>{kept}%</b>
              </div>
              <div>
                <span>Lost to wear</span>
                <b>{round(piece.lost)}</b>
              </div>
            </div>

            {piece.typical_price !== null && (
              <p className="detailnote">
                You normally pay about {round(piece.typical_price)} for this kind of thing
                {piece.difference !== null && piece.difference !== 0
                  ? `, so this was ${round(Math.abs(piece.difference))} ${piece.difference > 0 ? "more" : "less"}.`
                  : "."}
              </p>
            )}

            {piece.duplicates.length > 0 && (
              <p className="detailnote">
                Covers the same days as {piece.duplicates.join(", ")}.
              </p>
            )}

            {piece.notes && <p className="detailnote">{piece.notes}</p>}

            {piece.tags.length > 0 && (
              <div className="chips readonly">
                {piece.tags.map((t) => <span key={t}>{t}</span>)}
              </div>
            )}

            <div className="detailbtns">
              <button className="cta small" onClick={() => onWear(piece.id)}>Wore it today</button>
              {piece.yours && (
                <button className="ghostbtn" onClick={() => onRemove(piece.id)}>
                  Remove from closet
                </button>
              )}
            </div>

            <p className="detailcount">{index + 1} of {total}. Use the arrow keys to look through.</p>
          </div>
        )}
      </div>

      <button className="detailnav right" onClick={(e) => { e.stopPropagation(); onNext(); }}
              aria-label="Next item">›</button>
    </div>
  );
}
