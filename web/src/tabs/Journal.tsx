import { useRef, useState } from "react";
import { ClosetEntry, addClosetEntry, removeClosetEntry } from "../api";

const BLANK = {
  title: "", price: "", wears: "", note: "", link: "", size: "", color: "",
};

/** Photos are stored inline, so they have to stay small. 1.5MB of base64 is
 *  roughly a phone photo once the browser has scaled it down. */
const MAX_IMAGE_BYTES = 1_500_000;

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function Journal({
  entries, onChange,
}: { entries: ClosetEntry[]; onChange: () => void }) {
  const [form, setForm] = useState({ ...BLANK });
  const [image, setImage] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr("");
    try {
      const data = await readImage(file);
      if (data.length > MAX_IMAGE_BYTES) {
        setErr("That photo is too large. Something under about a megabyte works best.");
        return;
      }
      setImage(data);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "That file could not be read.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setErr("Give the item a name first."); return; }
    setSaving(true); setErr("");
    try {
      await addClosetEntry({
        title: form.title.trim(),
        price: form.price ? Number(form.price) : null,
        wears: form.wears ? Number(form.wears) : 0,
        note: form.note.trim() || null,
        link: form.link.trim() || null,
        size: form.size.trim() || null,
        color: form.color.trim() || null,
        image,
      });
      setForm({ ...BLANK });
      setImage(null);
      if (fileRef.current) fileRef.current.value = "";
      onChange();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await removeClosetEntry(id);
    onChange();
  }

  return (
    <>
      <section className="card">
        <h2>Add something to your closet</h2>
        <p className="lede">
          Write down what you own as you go. The name is the only part that matters, because
          everything else can be worked out from it. Add a photo and a note if you want to
          remember where it came from.
        </p>

        <form className="jform" onSubmit={submit}>
          <label className="wide">
            <span>What is it</span>
            <input value={form.title} onChange={set("title")}
                   placeholder="Charcoal crewneck" maxLength={120} />
          </label>

          <label>
            <span>What it cost</span>
            <input value={form.price} onChange={set("price")} inputMode="decimal" placeholder="58" />
          </label>

          <label>
            <span>Times worn</span>
            <input value={form.wears} onChange={set("wears")} inputMode="numeric" placeholder="12" />
          </label>

          <label>
            <span>Size</span>
            <input value={form.size} onChange={set("size")} placeholder="M" maxLength={20} />
          </label>

          <label>
            <span>Colour</span>
            <input value={form.color} onChange={set("color")} placeholder="charcoal" maxLength={40} />
          </label>

          <label className="wide">
            <span>Where it came from</span>
            <input value={form.link} onChange={set("link")} placeholder="https://" maxLength={600} />
          </label>

          <label className="wide">
            <span>Anything worth remembering</span>
            <textarea value={form.note} onChange={set("note")} rows={3} maxLength={600}
                      placeholder="Thrifted on Newbury Street. Runs big, sleeves are long." />
          </label>

          <label className="wide">
            <span>Photo</span>
            <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} />
          </label>

          {image && (
            <div className="preview">
              <img src={image} alt="" />
              <button type="button" className="tiny" onClick={() => {
                setImage(null); if (fileRef.current) fileRef.current.value = "";
              }}>Remove photo</button>
            </div>
          )}

          {err && <p className="err wide">{err}</p>}

          <div className="wide">
            <button type="submit" disabled={saving}>{saving ? "Saving" : "Add to closet"}</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Your journal</h2>
        <p className="lede">
          {entries.length
            ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}, newest first.`
            : "Nothing written down yet. Whatever you add above will show up here."}
        </p>

        <div className="jlist">
          {entries.map((e) => (
            <article className="jentry" key={e.id}>
              {e.image
                ? <img className="jthumb" src={e.image} alt="" />
                : <div className="jthumb blank" />}
              <div className="jbody">
                <div className="jtop">
                  <b>{e.title}</b>
                  <span className="muted">{when(e.created_at)}</span>
                </div>
                <div className="jfacts">
                  {e.price != null && <span>{`$${e.price}`}</span>}
                  {e.wears > 0 && <span>{`worn ${e.wears} times`}</span>}
                  {e.size && <span>{`size ${e.size}`}</span>}
                  {e.color && <span>{e.color}</span>}
                </div>
                {e.note && <p className="jnote">{e.note}</p>}
                <div className="jfoot">
                  {e.link && <a href={e.link} target="_blank" rel="noreferrer">Where it came from</a>}
                  <button className="tiny" onClick={() => remove(e.id)}>Remove</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
