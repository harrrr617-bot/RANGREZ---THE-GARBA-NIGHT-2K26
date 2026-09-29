import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import QRCode from "qrcode";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (
      !bookingId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        error: "Missing payment information."
      });
    }

    const { data: booking, error: bookingError } =
      await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .single();

    if (bookingError || !booking) {
      return res.status(404).json({
        error: "Booking not found."
      });
    }

    if (booking.razorpay_order_id !== razorpay_order_id) {
      return res.status(400).json({
        error: "Order mismatch."
      });
    }

    const generatedSignature = crypto
      .createHmac(
        "sha256",
        process.env.RAZORPAY_KEY_SECRET
      )
      .update(
        `${razorpay_order_id}|${razorpay_payment_id}`
      )
      .digest("hex");

    if (
      generatedSignature.length !==
      razorpay_signature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(generatedSignature),
        Buffer.from(razorpay_signature)
      )
    ) {
      return res.status(400).json({
        error: "Invalid payment signature."
      });
    }

    const payment =
      await razorpay.payments.fetch(
        razorpay_payment_id
      );

    if (payment.order_id !== razorpay_order_id) {
      return res.status(400).json({
        error: "Payment order mismatch."
      });
    }

    if (payment.amount !== booking.amount_paise) {
      return res.status(400).json({
        error: "Payment amount mismatch."
      });
    }

    if (payment.currency !== "INR") {
      return res.status(400).json({
        error: "Invalid payment currency."
      });
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        error: "Payment has not been captured."
      });
    }

    const { data, error } =
      await supabase.rpc(
        "finalize_booking",
        {
          p_booking_id: bookingId,
          p_payment_id: razorpay_payment_id
        }
      );

    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    const ticket = data[0];

    const baseUrl =
      process.env.PUBLIC_SITE_URL ||
      `https://${req.headers.host}`;

    const verifyUrl =
      `${baseUrl}/verify-ticket.html` +
      `?booking=${encodeURIComponent(ticket.booking_code)}` +
      `&token=${encodeURIComponent(ticket.entry_token)}`;

    const qrDataUrl =
      await QRCode.toDataURL(verifyUrl);

    return res.status(200).json({
      success: true,
      ticket: {
        bookingCode: ticket.booking_code,
        name: ticket.name,
        collegeRegNo: ticket.college_reg_no,
        quantity: ticket.quantity,
        amount: ticket.amount_paise / 100,
        qr: qrDataUrl
      }
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Payment verification failed."
    });

  }
}
