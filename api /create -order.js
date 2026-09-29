import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";

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
      name,
      collegeRegNo,
      phone,
      email,
      quantity
    } = req.body;

    const qty = Number(quantity);

    if (!name || !collegeRegNo || !phone || !email) {
      return res.status(400).json({
        error: "Please fill all required fields."
      });
    }

    if (!Number.isInteger(qty) || qty < 1 || qty > 5) {
      return res.status(400).json({
        error: "Ticket quantity must be between 1 and 5."
      });
    }

    const { data, error } = await supabase.rpc(
      "reserve_tickets",
      {
        p_name: name,
        p_college_reg_no: collegeRegNo,
        p_phone: phone,
        p_email: email,
        p_quantity: qty
      }
    );

    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    const booking = data[0];

    const order = await razorpay.orders.create({
      amount: qty * 39900,
      currency: "INR",
      receipt: booking.booking_code,
      notes: {
        booking_id: booking.booking_id,
        booking_code: booking.booking_code
      }
    });

    await supabase
      .from("bookings")
      .update({
        razorpay_order_id: order.id
      })
      .eq("id", booking.booking_id);

    return res.status(200).json({
      bookingId: booking.booking_id,
      bookingCode: booking.booking_code,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      remaining: booking.remaining
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Unable to create payment order."
    });

  }
}
