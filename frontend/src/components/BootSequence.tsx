import { type CSSProperties, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Brain, Code2, GraduationCap, Sparkles, X } from "lucide-react";

const orbitMarks = [BookOpen, Code2, Brain, GraduationCap, Sparkles];

export default function BootSequence({ open, onFinish }: { open: boolean; onFinish: () => void }) {
  const [canSkip, setCanSkip] = useState(false);
  useEffect(() => {
    if (!open) return;
    const skip = window.setTimeout(() => setCanSkip(true), 650);
    const finish = window.setTimeout(onFinish, 3850);
    return () => { window.clearTimeout(skip); window.clearTimeout(finish); };
  }, [open, onFinish]);

  return <AnimatePresence>
    {open && <motion.div className="boot-scene" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.06, filter: "blur(10px)" }} transition={{ duration: 0.72, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="boot-starwash" aria-hidden="true">{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</div>
      <div className="boot-nebula boot-nebula-a" /><div className="boot-nebula boot-nebula-b" />
      <div className="boot-core-beam" />
      <motion.div className="boot-orbit orbit-wide" initial={{ rotate: -22, scale: 0.65, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} transition={{ delay: 0.4, duration: 1.2 }} />
      <motion.div className="boot-orbit orbit-tight" initial={{ rotate: 38, scale: 0.55, opacity: 0 }} animate={{ rotate: -12, scale: 1, opacity: 1 }} transition={{ delay: 0.7, duration: 1.1 }} />
      {orbitMarks.map((Icon, index) => <motion.span className={`boot-symbol boot-symbol-${index}`} key={index} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: [0, 1, 0.78] }} transition={{ delay: 0.85 + index * 0.13, duration: 0.55 }}><Icon size={17} /></motion.span>)}
      <motion.img className="boot-logo" src="/edupulse-logo.svg" alt="EduPulse — Understand, Practice, Improve" initial={{ opacity: 0, scale: 0.78, y: 18, filter: "blur(10px)" }} animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }} transition={{ delay: 0.55, duration: 0.95, type: "spring", stiffness: 58, damping: 16 }} />
      <motion.div className="boot-edu" initial={{ x: 110, y: 55, opacity: 0, rotate: 12 }} animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }} transition={{ delay: 1.7, duration: 0.9, type: "spring", stiffness: 55 }}>
        <span className="boot-edu-arm" /><div className="boot-edu-head"><i /><i /></div><div className="boot-edu-body"><b /></div><span className="boot-edu-wave">✦</span>
      </motion.div>
      {canSkip && <motion.button className="boot-skip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onFinish}>SKIP INTRO <X size={14} /></motion.button>}
      <div className="boot-coordinate">EDU OS <span>·</span> LEARNING SYSTEM ONLINE</div>
    </motion.div>}
  </AnimatePresence>;
}
