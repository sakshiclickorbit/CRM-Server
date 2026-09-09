const nodemailer = require("nodemailer");
console.log({
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
});
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendOTPEmail = async (email, otp) => {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "Click Orbits - Password Reset OTP",
    html: `
      <div style="font-family:Arial,sans-serif;padding:20px;background:#f8f9fa">
        <div style="max-width:600px;margin:auto;background:#fff;border-radius:10px;padding:30px">

          <h2 style="color:#2F5D99;margin-bottom:20px">
            Click Orbits
          </h2>

          <p>Hello,</p>

          <p>
            We received a request to reset your password.
          </p>

          <p>Your OTP is</p>

          <div style="
              font-size:36px;
              font-weight:bold;
              letter-spacing:8px;
              color:#2F5D99;
              margin:25px 0;
              text-align:center;
          ">
              ${otp}
          </div>

          <p>
            This OTP will expire in
            <strong>10 minutes</strong>.
          </p>

          <p>
            If you didn't request a password reset,
            you can safely ignore this email.
          </p>

          <hr>

          <small>
            Click Orbits CRM
          </small>

        </div>
      </div>
    `,
  });
};

module.exports = {
  sendOTPEmail,
};
