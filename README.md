# XRayPDF 🔍✨

**XRayPDF** is a powerful web application designed to help students uncover hidden text in homework PDFs. Teachers sometimes embed text in tricky ways—using near‑invisible colors, extremely small fonts, or even steganographic tricks. PixelReveal renders each PDF page as an image, then applies a combination of pixel‑level analysis and Optical Character Recognition (OCR) to detect and reveal any hidden content. The result is a new, enhanced image where the hidden text becomes clearly visible.

![XRayPDF Demo](https://via.placeholder.com/800x400.png?text=PixelReveal+Demo+Screenshot)  
*will replace with actual demo screenshot)*

---

## 🚀 Features

- 📤 **Upload PDF** – Drag‑and‑drop or select a PDF file.
- 🖼️ **Page‑by‑Page Rendering** – Each page is converted to a high‑resolution image.
- 🔎 **Pixel‑Level Analysis** – Detects text with near‑background colors, low contrast, or steganographic patterns.
- 🔡 **OCR for Tiny Text** – Identifies and extracts extremely small fonts (e.g., <8pt).
- 🎨 **Revealed Image Generation** – Enhances low‑contrast areas, magnifies tiny text regions, or overlays OCR‑extracted text.
- 👁️ **Side‑by‑Side Comparison** – View original and revealed pages together.
- ⬇️ **Download Results** – Save the enhanced image for offline study.

---

## 🧠 How It Works

1. **Upload PDF**  
   The user uploads a PDF file. The backend uses `pdf.js` to render each page to a canvas at a high DPI, producing a sharp image buffer.

2. **Pixel Analysis**  
   The image is processed with `sharp` to:
   - Stretch contrast to amplify subtle differences.
   - Invert colors to reveal light‑on‑light text.
   - Detect edges that may indicate character shapes.

3. **OCR for Tiny Text**  
   The same page image is fed to `tesseract.js`. The OCR engine identifies text regions and estimates font sizes. Text smaller than a configurable threshold (e.g., 8pt equivalent) is flagged as “tiny hidden text.”

4. **Revealed Image Generation**  
   Based on the analysis:
   - Low‑contrast areas are enhanced.
   - Tiny text regions are cropped, upscaled, and blended back into the image.
   - Optionally, the OCR‑extracted text can be overlaid in a large, clear font.

5. **Display Results**  
   The original and revealed images are shown side‑by‑side. Users can download the revealed image or toggle different enhancement modes.

---

## 🛠️ Tech Stack

| Area               | Technology                                                                 |
|--------------------|----------------------------------------------------------------------------|
| Frontend           | [Next.js](https://nextjs.org/) (App Router), [React](https://reactjs.org/), [Tailwind CSS](https://tailwindcss.com/) |
| Backend            | Next.js API routes                                                         |
| PDF Rendering      | [pdf.js](https://mozilla.github.io/pdf.js/) (Mozilla)                      |
| Image Processing   | [sharp](https://sharp.pixelplumbing.com/)                                  |
| OCR                | [tesseract.js](https://tesseract.projectnaptha.com/)                       |
| Deployment         | [Vercel](https://vercel.com/) (frontend) + optional self‑hosted worker     |

---

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/pixelrevel.git
   cd pixelrevel