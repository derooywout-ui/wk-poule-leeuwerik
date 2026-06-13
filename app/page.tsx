"use client"
import dynamic from "next/dynamic"
const App = dynamic(() => import("@/components/wk-poule-app"), { ssr: false })
export default function Page() {
  return <App />
}
