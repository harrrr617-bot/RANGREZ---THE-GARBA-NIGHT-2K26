export default async function handler(req, res) {
  res.status(200).json({
    keyId: process.env.RAZORPAY_KEY_ID
  });
}
