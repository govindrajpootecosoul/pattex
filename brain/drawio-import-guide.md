# Draw.io (diagrams.net) mein Pattex flow diagram

Haan — **ho sakta hai**. Chat ki image edit nahi hoti; project mein yeh files use karo:

| File | Kaam |
|------|------|
| `brain/backend-api-flow.mmd` | Pure Mermaid — draw.io mein paste |
| `brain/backend-api-flow.md` | Same diagram + extra charts (Markdown) |

---

## Method 1 — Mermaid se direct (sabse easy)

1. Kholo: **https://app.diagrams.net/** (ya desktop **draw.io**)
2. **Create New Diagram** → Blank
3. Toolbar mein **+** (Insert) → **Mermaid**  
   - Agar nahi dikhe: menu **Arrange** → **Insert** → **Mermaid**  
   - Ya search box: type `mermaid`
4. File kholo: `brain/backend-api-flow.mmd` → **saara text copy** (Ctrl+A, Ctrl+C)
5. Draw.io ke Mermaid dialog mein **paste** → **Insert**
6. Diagram canvas par aa jayega — ab boxes drag, text edit, colors change kar sakte ho
7. Save: **File → Save as** → `backend-api-flow.drawio` (project `brain/` folder mein rakho)

**Note:** Bahut bada diagram ho to zoom out karo; signup/login boxes alag move kar sakte ho.

---

## Method 2 — SVG import (agar Mermaid import fail ho)

1. Kholo: **https://mermaid.live**
2. `backend-api-flow.mmd` ka content paste karo
3. **Actions → Export → SVG**
4. Draw.io: **File → Import from → Device** → woh `.svg` file choose karo
5. SVG select karo → **Arrange → Ungroup** (2–3 baar) taaki har box alag edit ho

---

## Method 3 — Khud draw.io se banana

`backend-api-flow.md` ko side mein rakho reference ke liye; draw.io shapes se manually banao. Zyada control, zyada time.

---

## Edit ke baad project mein rakhna

Recommended save path:

```
brain/backend-api-flow.drawio
```

Git mein commit kar sakte ho — team sab draw.io se khol sakti hai.

---

## Agar Mermaid option hi nahi dikhe

- diagrams.net **latest** use karo (browser refresh)
- Desktop app update karo
- Tab tak **Method 2 (SVG)** use karo — hamesha kaam karta hai
