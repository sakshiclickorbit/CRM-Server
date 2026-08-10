const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");
 
const router = express.Router();
const upload = multer(); // No disk storage needed, handle in memory
 
router.post("/", upload.single("attachment"), async (req, res) => {
  try {
    const {
      from = process.env.MAIL_FROM,
      to = "[]",
      cc = "[]",
      bcc = "[]",
      subject,
      text,
      html,
    } = req.body;
 
    // Parse arrays from stringified JSON (sent from frontend)
    const toList = JSON.parse(to);
    const ccList = JSON.parse(cc);
    const bccList = JSON.parse(bcc);
 
    const normalize = (val) =>
      Array.isArray(val) ? val.filter(Boolean).join(",") : val;
 
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
 
    const mailOptions = {
      from,
      to: normalize(toList),
      cc: normalize(ccList),
      bcc: normalize(bccList),
      subject,
      text,
      html,
      attachments: [],
    };
 
    // PDF File attachment (from FormData)
    if (req.file) {
      mailOptions.attachments.push({
        filename: req.file.originalname || "invoice.pdf",
        content: req.file.buffer,
        contentType: req.file.mimetype || "application/pdf",
      });
    }
 
    const info = await transporter.sendMail(mailOptions);
 
    res.json({
      ok: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
    });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
 
module.exports = router;
 
