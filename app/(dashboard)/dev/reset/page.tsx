import { notFound } from "next/navigation"
import ResetForm from "./reset-form"

export default function DevResetPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  return <ResetForm />
}
