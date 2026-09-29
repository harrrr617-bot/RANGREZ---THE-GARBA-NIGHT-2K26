import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const rawBody = await req.text();

    const signature =
      req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        error: "Missing webhook signature."
      });
    }

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          process.env.RAZORPAY_WEBHOOK_SECRET
        )
        .update(rawBody)
        .digest("hex");

    if (
      expectedSignature.length !==
      signature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      )
    ) {
      return res.status(400).json({
        error: "Invalid webhook signature."
      });
    }

    const event = JSON.parse(rawBody);

    if (event.event === "order.paid") {

      const payment =
        event.payload?.payment?.entity;

      const orderId =
        payment?.order_id;

      const paymentId =
        payment?.id;

      if (orderId && paymentId) {

        const { error } =
          await supabase
            .from("bookings")
            .update({
              razorpay_payment_id: paymentId
            })
            .eq("razorpay_order_id", orderId);

        if (error) {
          console.error(error);
        }
      }
    }

    return res.status(200).json({
      received: true
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Webhook processing failed."
    });

  }

}
