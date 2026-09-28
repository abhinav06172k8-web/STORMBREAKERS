import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export type EDUState = "idle" | "thinking" | "analyzing" | "celebrating" | "warning" | "studying";

export default function EDUMascot({ state = "idle", message = "Ready when you are." }: { state?: EDUState; message?: string }) {
  return <motion.aside className={`edu-companion edu-${state}`} initial={{ opacity: 0, x: 24, y: 8 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: .45 }} aria-label={`EDU says: ${message}`}>
    <div className="edu-speech"><Sparkles size={12} />{message}</div>
    <motion.div className="edu-bot" animate={state === "celebrating" ? { y: [0, -18, 0], rotate: [0, 8, -6, 0] } : state === "warning" ? { rotate: [0, -3, 3, 0] } : { y: [0, -5, 0] }} transition={{ duration: state === "celebrating" ? .65 : 3.2, repeat: state === "celebrating" ? 1 : Infinity, ease: "easeInOut" }}>
      <div className="edu-ear ear-left"/><div className="edu-ear ear-right"/><div className="edu-face"><i/><i/><b/></div><div className="edu-body"><span/></div><div className="edu-hand hand-left"/><div className="edu-hand hand-right"/>
    </motion.div>
    <span className="edu-label">EDU <i/> {state.toUpperCase()}</span>
  </motion.aside>;
}
