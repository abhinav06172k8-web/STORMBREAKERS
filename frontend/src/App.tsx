import { ChangeEvent, CSSProperties, DragEvent, FormEvent, RefObject, Suspense, lazy, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, ClipboardCheck, Clock3, ExternalLink, FileText,
  GraduationCap, Lightbulb, LockKeyhole, Menu, MessageCircle, Play, RotateCcw,
  Send, Sparkles, Target, Trophy, Upload, UserRound, X, Zap,
} from "lucide-react";
import { apiRequest, apiUpload, getAIHealth } from "./services/api";

const ImmersiveWorld = lazy(() => import("./components/ImmersiveWorld"));
const BootSequence = lazy(() => import("./components/BootSequence"));
const EDUMascot = lazy(() => import("./components/EDUMascot"));

type Criterion = { id: string; description: string; max_marks: number; expected_elements: string[]; concept?: string; sub_concept?: string; status_marks?: Record<string, number> };
type RubricQuestion = { question_number: number; question_text: string; max_marks: number; concepts: string[]; criteria: Criterion[] };
type Stage = "home" | "teacher" | "rubric" | "upload" | "analysis" | "results" | "diagnosis" | "practice" | "quiz" | "quiz-result" | "retest" | "retest-result" | "resources";
type Resource = { title: string; channel: string; duration: string; url: string; videoId?: string; color: string; description: string; thumbnail?: string };
type QuizItem = { kind: string; concept?: string; sub?: string; prompt: string; options: string[]; answer?: number; explanation?: string };
type QuizReviewItem = { question: string; kind: string; concept: string; sub: string; selectedAnswer: string; correctAnswer: string; correct: boolean; explanation: string };
type ChatMessage = { role: "user" | "assistant"; content: string; suggested_followups?: string[] };
type ChatContext = { exam_title: string; subject: string; paper_score: number | null; teacher_paper_score: number | null; paper_max_marks: number | null; teacher_awarded_marks: TeacherQuestionMark[]; questions: Array<{ question_number: number; question_text: string; question_score: number; max_marks: number; criteria: Array<{ criterion: string; expected: string[]; student_evidence: string; status: string; awarded_marks: number; max_marks: number; explanation: string }> }> };
type GeneratedQuizResponse = { session_id: string; questions: Array<{ question: string; question_type: string; concept?: string; sub_concept?: string | null; options: string[] }> };
type LearningPlan = { misunderstanding: string; short_explanation: string; key_ideas: string[]; targeted_practice: string[]; next_step: string };
type EvalCriterion = { criterion_id: string; criterion: string; concept?: string; sub_concept?: string; expected: string[]; student_evidence: string; status: string; awarded_marks: number; max_marks: number; confidence: number; explanation: string; teacher_review_recommended: boolean };
type QuestionResult = { question_number: number; question_text?: string; question_score: number; max_marks: number; criteria_evaluation: EvalCriterion[] };
type TeacherQuestionMark = { question_number: number; awarded_marks: number; confidence?: number; page?: number; evidence?: string; source?: "vision" | "manual" };
type TeacherMarkIssue = { page?: number; question_number?: number | null; reason: string };
type PaperResult = { questions: QuestionResult[]; paper_score: number | null; paper_max_marks: number; finalized: boolean; provisional_subtotal: number; teacher_review_recommended: boolean; teacher_awarded_marks?: TeacherQuestionMark[]; teacher_paper_score?: number; teacher_marks_status?: "detected" | "uncertain" | "not_found"; teacher_marks_review?: TeacherMarkIssue[]; concepts?: Array<{ concept: string; sub_concept?: string; mastery_estimate: number }> };

const SAMPLE_RUBRIC: RubricQuestion[] = [
  { question_number: 1, question_text: "Variables & Data Types", max_marks: 5, concepts: ["Variables"], criteria: [
    { id: "Q1-C1", description: "Variable assignment", max_marks: 2, expected_elements: ["valid assignment"] },
    { id: "Q1-C2", description: "Data types", max_marks: 2, expected_elements: ["appropriate Python types"] },
    { id: "Q1-C3", description: "Example", max_marks: 1, expected_elements: ["relevant example"] },
  ] },
  { question_number: 2, question_text: "Loops", max_marks: 10, concepts: ["Loops"], criteria: [
    { id: "Q2-C1", description: "Initialization", max_marks: 2, expected_elements: ["loop variable initialized"] },
    { id: "Q2-C2", description: "Condition", max_marks: 2, expected_elements: ["correct condition"] },
    { id: "Q2-C3", description: "Update", max_marks: 2, expected_elements: ["progress toward termination"] },
    { id: "Q2-C4", description: "Output / trace", max_marks: 2, expected_elements: ["correct output"] },
    { id: "Q2-C5", description: "Loop termination", max_marks: 2, expected_elements: ["terminating behavior"] },
  ] },
  { question_number: 3, question_text: "Functions", max_marks: 10, concepts: ["Functions"], criteria: [
    { id: "Q3-C1", description: "Function definition", max_marks: 2, expected_elements: ["def and function name"], concept: "Functions" },
    { id: "Q3-C2", description: "Parameters and arguments", max_marks: 2, expected_elements: ["parameter receives argument"], concept: "Functions" },
    { id: "Q3-C3", description: "Return value", max_marks: 2, expected_elements: ["return passes result back"], concept: "Functions" },
    { id: "Q3-C4", description: "Scope", max_marks: 2, expected_elements: ["local scope"], concept: "Functions" },
    { id: "Q3-C5", description: "Function call", max_marks: 2, expected_elements: ["valid invocation"], concept: "Functions" },
  ] },
  { question_number: 4, question_text: "Recursion", max_marks: 15, concepts: ["Recursion"], criteria: [
    { id: "Q4-C1", description: "Base case", max_marks: 3, expected_elements: ["stopping condition", "base-case return"], concept: "Recursion", sub_concept: "Base cases" },
    { id: "Q4-C2", description: "Recursive call", max_marks: 4, expected_elements: ["function calls itself", "smaller input"], concept: "Recursion", sub_concept: "Recursive calls" },
    { id: "Q4-C3", description: "Correct logic", max_marks: 4, expected_elements: ["correct recurrence", "termination"], concept: "Recursion", sub_concept: "Termination conditions" },
    { id: "Q4-C4", description: "Output / tracing", max_marks: 2, expected_elements: ["correct call sequence or result"], concept: "Recursion", sub_concept: "Recursive tracing" },
    { id: "Q4-C5", description: "Explanation", max_marks: 2, expected_elements: ["explains base and recursive steps"], concept: "Recursion" },
  ] },
  { question_number: 5, question_text: "File Handling", max_marks: 10, concepts: ["File Handling"], criteria: [
    { id: "Q5-C1", description: "Open and close", max_marks: 2, expected_elements: ["opens file safely"] },
    { id: "Q5-C2", description: "Read or write", max_marks: 2, expected_elements: ["correct file operation"] },
    { id: "Q5-C3", description: "File mode", max_marks: 2, expected_elements: ["appropriate mode"] },
    { id: "Q5-C4", description: "Exception handling", max_marks: 2, expected_elements: ["handles file errors"] },
    { id: "Q5-C5", description: "Iteration", max_marks: 2, expected_elements: ["reads or processes content"] },
  ] },
];

function loadApprovedRubric(): RubricQuestion[] {
  try {
    const saved = sessionStorage.getItem("edumind-approved-rubric");
    if (!saved) return SAMPLE_RUBRIC;
    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed as RubricQuestion[] : SAMPLE_RUBRIC;
  } catch { return SAMPLE_RUBRIC; }
}

const SAMPLE_RESULTS: QuestionResult[] = [
  { question_number: 1, question_score: 5, max_marks: 5, criteria_evaluation: [
    { criterion_id: "Q1-C1", criterion: "Variable assignment", expected: ["valid assignment"], student_evidence: "score = 12", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .98, explanation: "The assignment is valid.", teacher_review_recommended: false },
    { criterion_id: "Q1-C2", criterion: "Data types", expected: ["appropriate Python types"], student_evidence: "int, str and float", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .97, explanation: "All three types are identified correctly.", teacher_review_recommended: false },
    { criterion_id: "Q1-C3", criterion: "Example", expected: ["relevant example"], student_evidence: "age = 20", status: "satisfied", awarded_marks: 1, max_marks: 1, confidence: .98, explanation: "A relevant assignment example is included.", teacher_review_recommended: false },
  ] },
  { question_number: 2, question_score: 8, max_marks: 10, criteria_evaluation: [
    { criterion_id: "Q2-C1", criterion: "Initialization", expected: ["loop variable initialized"], student_evidence: "for i in range(5)", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .93, explanation: "The range initializes the iteration values.", teacher_review_recommended: false },
    { criterion_id: "Q2-C2", criterion: "Condition", expected: ["correct condition"], student_evidence: "range(5)", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .91, explanation: "The loop condition is bounded correctly.", teacher_review_recommended: false },
    { criterion_id: "Q2-C3", criterion: "Update", expected: ["progress toward termination"], student_evidence: "range advances i", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .9, explanation: "The iteration variable advances each cycle.", teacher_review_recommended: false },
    { criterion_id: "Q2-C4", criterion: "Output / trace", expected: ["correct output"], student_evidence: "prints 0, 1, 2, 3, 4", status: "partially_satisfied", awarded_marks: 1, max_marks: 2, confidence: .88, explanation: "The sequence is right, but the final boundary is not explained.", teacher_review_recommended: false },
    { criterion_id: "Q2-C5", criterion: "Loop termination", expected: ["terminating behavior"], student_evidence: "stops after 5", status: "partially_satisfied", awarded_marks: 1, max_marks: 2, confidence: .85, explanation: "Termination is stated without describing the boundary check.", teacher_review_recommended: false },
  ] },
  { question_number: 3, question_score: 6, max_marks: 10, criteria_evaluation: [
    { criterion_id: "Q3-C1", criterion: "Function definition", expected: ["def and function name"], student_evidence: "def greet(name):", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .93, explanation: "The function definition is valid.", teacher_review_recommended: false },
    { criterion_id: "Q3-C2", criterion: "Parameters and arguments", expected: ["parameter receives argument"], student_evidence: "name is used as the input", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .91, explanation: "The parameter's role is understood.", teacher_review_recommended: false },
    { criterion_id: "Q3-C3", criterion: "Return value", expected: ["return passes result back"], student_evidence: "prints the greeting", status: "partially_satisfied", awarded_marks: 1, max_marks: 2, confidence: .87, explanation: "Printing is shown, but returning a value is not distinguished from printing.", teacher_review_recommended: false },
    { criterion_id: "Q3-C4", criterion: "Scope", expected: ["local scope"], student_evidence: "No corresponding requirement was located in the submitted answer.", status: "missing", awarded_marks: 0, max_marks: 2, confidence: .84, explanation: "The answer does not address local scope for the function.", teacher_review_recommended: false },
    { criterion_id: "Q3-C5", criterion: "Function call", expected: ["valid invocation"], student_evidence: "greet(\"Maya\")", status: "satisfied", awarded_marks: 1, max_marks: 2, confidence: .86, explanation: "A valid call is present; the result handling is not shown.", teacher_review_recommended: false },
  ] },
  { question_number: 4, question_score: 5, max_marks: 15, criteria_evaluation: [
    { criterion_id: "Q4-C1", criterion: "Base case", expected: ["stopping condition", "base-case return"], student_evidence: "Submitted code: `return n * fact(n - 1)`; no conditional base-case branch is present in the response.", status: "missing", awarded_marks: 0, max_marks: 3, confidence: .94, explanation: "The shown function has no stopping condition, so the recursive calls cannot end.", teacher_review_recommended: false },
    { criterion_id: "Q4-C2", criterion: "Recursive call", expected: ["function calls itself", "smaller input"], student_evidence: "fact(n - 1)", status: "satisfied", awarded_marks: 4, max_marks: 4, confidence: .97, explanation: "The function calls itself with a smaller input.", teacher_review_recommended: false },
    { criterion_id: "Q4-C3", criterion: "Correct logic", expected: ["correct recurrence", "termination"], student_evidence: "return n * fact(n - 1)", status: "partially_satisfied", awarded_marks: 1, max_marks: 4, confidence: .92, explanation: "The factorial recurrence is present, but without a base case it does not terminate.", teacher_review_recommended: false },
    { criterion_id: "Q4-C4", criterion: "Output / tracing", expected: ["correct call sequence or result"], student_evidence: "No corresponding requirement was located in the submitted answer.", status: "missing", awarded_marks: 0, max_marks: 2, confidence: .9, explanation: "No trace or output is included for the recursive calls.", teacher_review_recommended: false },
    { criterion_id: "Q4-C5", criterion: "Explanation", expected: ["explains base and recursive steps"], student_evidence: "No corresponding requirement was located in the submitted answer.", status: "missing", awarded_marks: 0, max_marks: 2, confidence: .91, explanation: "The answer provides code only and does not explain the base and recursive steps.", teacher_review_recommended: false },
  ] },
  { question_number: 5, question_score: 7, max_marks: 10, criteria_evaluation: [
    { criterion_id: "Q5-C1", criterion: "Open and close", expected: ["opens file safely"], student_evidence: "with open(\"notes.txt\") as f", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .95, explanation: "The context manager closes the file safely.", teacher_review_recommended: false },
    { criterion_id: "Q5-C2", criterion: "Read or write", expected: ["correct file operation"], student_evidence: "f.read()", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .96, explanation: "The answer uses a read operation.", teacher_review_recommended: false },
    { criterion_id: "Q5-C3", criterion: "File mode", expected: ["appropriate mode"], student_evidence: "default read mode", status: "satisfied", awarded_marks: 2, max_marks: 2, confidence: .87, explanation: "The default mode is appropriate for reading.", teacher_review_recommended: false },
    { criterion_id: "Q5-C4", criterion: "Exception handling", expected: ["handles file errors"], student_evidence: "No corresponding requirement was located in the submitted answer.", status: "missing", awarded_marks: 0, max_marks: 2, confidence: .83, explanation: "No file error handling is shown.", teacher_review_recommended: false },
    { criterion_id: "Q5-C5", criterion: "Iteration", expected: ["reads or processes content"], student_evidence: "reads all content at once", status: "partially_satisfied", awarded_marks: 1, max_marks: 2, confidence: .85, explanation: "The content is read, but line-by-line processing is not shown.", teacher_review_recommended: false },
  ] },
];

const PRACTICE_QUESTIONS: QuizItem[] = [
  { kind: "Conceptual", concept: "Recursion", sub: "Base cases", prompt: "What makes a base case essential in a recursive function?", options: ["It stores every previous result", "It stops recursion for a simple input", "It calls the function one last time", "It changes a local variable"], answer: 1, explanation: "A base case handles a simple input directly and stops further recursive calls. Without it, the function has no stopping point." },
  { kind: "Code reading", concept: "Functions", sub: "Return values", prompt: "A function prints `total` but has no `return`. What does `result = add(2, 3)` assign to result?", options: ["5", "None", "The printed text", "The function itself"], answer: 1, explanation: "Printing displays a value, but it does not send that value back to the caller. A Python function without an explicit return value returns None." },
  { kind: "Output tracing", concept: "Recursion", sub: "Recursive tracing", prompt: "For total(1) → 1 and total(n) → n + total(n−1), what is total(3)?", options: ["3", "5", "6", "7"], answer: 2, explanation: "Expand the calls: total(3) = 3 + total(2) = 3 + 2 + total(1) = 3 + 2 + 1 = 6." },
  { kind: "Application", concept: "File Handling", sub: "Safe file access", prompt: "Which pattern closes a file automatically, including when an error occurs?", options: ["f = open(path); print(f.read())", "with open(path) as f: data = f.read()", "open(path, close=False)", "f = read(path)"], answer: 1, explanation: "The with statement uses a context manager. It closes the file when the block ends, including when an exception interrupts the block." },
  { kind: "Error detection", concept: "Recursion", sub: "Termination conditions", prompt: "What is the main risk when a function calls itself with n−1 but has no stopping branch?", options: ["It returns too early", "It skips the first call", "It can recurse until a runtime error", "It becomes a loop"], answer: 2, explanation: "Each call uses a smaller input, but there is no branch to stop at a simple input. Calls continue until Python raises a recursion-depth error." },
];

const RETEST_QUESTIONS: QuizItem[] = [
  { kind: "Conceptual", prompt: "For a recursive countdown, which case should stop further calls?", options: ["n > 0", "n == 0", "n is unchanged", "n + 1"], answer: 1, explanation: "A countdown reaches zero, so n == 0 is the stopping case. Values above zero can continue to the next call." },
  { kind: "Tracing", prompt: "A function returns 1 at n=1, otherwise n × f(n−1). What is f(4)?", options: ["10", "16", "24", "120"], answer: 2, explanation: "Trace the calls: f(4) = 4 × f(3) = 4 × 3 × f(2) = 4 × 3 × 2 × f(1) = 24." },
  { kind: "Error detection", prompt: "A recursive branch returns f(n−1) but forgets to return it. What is the likely issue?", options: ["The result is not passed back up", "The base case runs twice", "The argument becomes global", "The function becomes iterative"], answer: 0, explanation: "Without returning the recursive call's result, the caller does not pass that value back to its own caller. The computed result can be lost." },
  { kind: "Application", prompt: "Which recurrence correctly sums integers from 1 through n?", options: ["n + sum(n−1), with sum(0)=0", "n × sum(n+1), with sum(0)=1", "sum(n), with sum(0)=n", "n − sum(n−1), with sum(1)=0"], answer: 0, explanation: "Add the current n to the sum of smaller integers. sum(0)=0 contributes nothing and provides the stopping point." },
  { kind: "Code reasoning", prompt: "Choose the best base case for factorial when n is a non-negative integer.", options: ["if n == 0: return 1", "if n > 0: return n", "if n == 1: return n * fact(n-1)", "if n < 0: call fact(n)"], answer: 0, explanation: "By definition, 0! = 1. Returning 1 at n == 0 stops recursion and allows the multiplications to resolve as calls return." },
];

const makeVideo = (videoId: string, title: string, channel: string, duration: string, color: string, description: string): Resource => ({
  videoId, title, channel, duration, color, description,
  url: `https://www.youtube.com/watch?v=${videoId}`,
  thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
});
const RESOURCE_FALLBACKS: Record<string, Resource[]> = {
  Recursion: [
    makeVideo("9bsK03SlmNM", "Simple Explanation of Recursion in Python", "codebasics", "18 min", "lavender", "A visual introduction to recursive calls, with a Python example and practice problem."),
    makeVideo("eUsugWoJJnA", "Recursion: Base Case vs Recursive Case", "Amulya's Academy", "12 min", "mint", "Focuses on stopping conditions, recursive cases, and what happens when a base case is missing."),
    makeVideo("9t0lEEnapnk", "Python Recursion: Base Case and Recursive Step", "MIT OpenCourseWare", "14 min", "peach", "A course-style explanation of how a recursive step moves toward its base case."),
  ],
  Functions: [
    makeVideo("9Os0o3wzS_I", "Python Functions for Beginners", "Corey Schafer", "18 min", "lavender", "Builds a clear foundation in defining, calling, and returning values from functions."),
    makeVideo("spMSVp13keA", "Python Return Statements Explained", "CodeLucky", "9 min", "mint", "A focused beginner lesson on returning values from functions."),
    makeVideo("JP7ITIXGpHk", "Functions and Variables in Python", "CS50", "58 min", "peach", "A full introductory lecture with examples and guided explanations."),
  ],
  "File Handling": [
    makeVideo("BRrem1k3904", "Python File Handling for Beginners", "Python tutorial", "16 min", "lavender", "Covers opening, reading, writing, and safely closing files."),
    makeVideo("KD-Yoel6EVQ", "File I/O in Python", "CS50P", "47 min", "mint", "A complete lesson on working with files in Python."),
    makeVideo("XxRtj-GU5_8", "Python File Operations: Read, Write, Append", "Python tutorial", "13 min", "peach", "Walks through common file modes and basic file operations."),
  ],
};
const DEMO_RESOURCES = RESOURCE_FALLBACKS.Recursion;

function buildQuizReview(questions: QuizItem[], selected: number[], result?: Array<{ question_index: number; correct: boolean; correct_answer: string; explanation: string }>): QuizReviewItem[] {
  return questions.map((question, index) => {
    const server = result?.find((item) => item.question_index === index);
    const correctIndex = question.answer;
    return {
      question: question.prompt,
      kind: question.kind,
      concept: question.concept ?? "Recursion",
      sub: question.sub ?? "Practice",
      selectedAnswer: question.options[selected[index]] ?? "No answer selected",
      correctAnswer: server?.correct_answer ?? question.options[correctIndex ?? 0],
      correct: server?.correct ?? (correctIndex !== undefined && selected[index] === correctIndex),
      explanation: server?.explanation ?? question.explanation ?? "Review the concept and compare your choice with the correct answer.",
    };
  });
}

const STAGES: { id: Stage; label: string; group: string }[] = [
  { id: "home", label: "Home", group: "EDUPULSE" },
  { id: "teacher", label: "Exams", group: "LEARN" },
  { id: "results", label: "Analysis", group: "ANALYZE" },
  { id: "practice", label: "Practice", group: "GROW" },
  { id: "resources", label: "Resources", group: "GROW" },
  { id: "diagnosis", label: "Progress", group: "GROW" },
];

export default function App() {
  const [stage, setStage] = useState<Stage>("home");
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem("eduplus-intro-seen"));
  const [worldEnabled, setWorldEnabled] = useState(() => Boolean(localStorage.getItem("eduplus-intro-seen")));
  const [visualMode, setVisualMode] = useState<"cinematic" | "balanced" | "performance">(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4) return "performance";
    return "cinematic";
  });
  const [demoMode, setDemoMode] = useState(true);
  const [rubric, setRubric] = useState<RubricQuestion[]>(loadApprovedRubric);
  const [rubricApproved, setRubricApproved] = useState(() => sessionStorage.getItem("edumind-rubric-approved") === "true");
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [rubricNotice, setRubricNotice] = useState("");
  const [answerFile, setAnswerFile] = useState<File | null>(null);
  const [sampleAnswer, setSampleAnswer] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysis, setAnalysis] = useState<PaperResult | null>(null);
  const [analysisNote, setAnalysisNote] = useState("");
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null);
  const [practiceAnswers, setPracticeAnswers] = useState<number[]>(Array(5).fill(-1));
  const [practiceQuestions, setPracticeQuestions] = useState<QuizItem[]>(PRACTICE_QUESTIONS);
  const [practiceSession, setPracticeSession] = useState<string | null>(null);
  const [practiceScore, setPracticeScore] = useState<number | null>(null);
  const [practiceReview, setPracticeReview] = useState<QuizReviewItem[]>([]);
  const [practiceGap, setPracticeGap] = useState("Termination conditions");
  const [retestAnswers, setRetestAnswers] = useState<number[]>(Array(5).fill(-1));
  const [retestQuestions, setRetestQuestions] = useState<QuizItem[]>(RETEST_QUESTIONS);
  const [retestSession, setRetestSession] = useState<string | null>(null);
  const [retestScore, setRetestScore] = useState<number | null>(null);
  const [learningPlan, setLearningPlan] = useState<LearningPlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [resources, setResources] = useState<Resource[]>(RESOURCE_FALLBACKS.Recursion);
  const [resourceConcept, setResourceConcept] = useState("Recursion");
  const [liveResources, setLiveResources] = useState(false);
  const [resourcesBusy, setResourcesBusy] = useState(false);
  const resourceRequestId = useRef(0);
  const resourceReturnStage = useRef<Stage>("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ role: "assistant", content: "Hi, I’m EDU. Ask me about your marks, a rubric point, or a study concept you want to understand." }]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const usingDemoData = sampleAnswer || (demoMode && !answerFile);

  useEffect(() => {
    getAIHealth<{ local_ai: boolean }>().then((health) => setAiAvailable(health.local_ai)).catch(() => setAiAvailable(false));
  }, []);
  useEffect(() => { if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [chatMessages, chatOpen, chatBusy]);

  const go = (next: Stage) => { setError(""); setMobileNav(false); setStage(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const setCriterion = (questionIndex: number, criterionIndex: number, field: "description" | "max_marks", value: string) => {
    setRubricApproved(false);
    sessionStorage.removeItem("edumind-rubric-approved");
    setRubric((current) => current.map((question, qi) => qi !== questionIndex ? question : {
      ...question, criteria: question.criteria.map((criterion, ci) => {
        if (ci !== criterionIndex) return criterion;
        return field === "description"
          ? { ...criterion, description: value }
          : { ...criterion, max_marks: Math.max(0, Number(value) || 0) };
      }),
    }));
  };

  const approveRubric = () => {
    const invalid = rubric.find((question) => question.criteria.reduce((sum, criterion) => sum + criterion.max_marks, 0) !== question.max_marks);
    if (invalid) { setError(`Criteria for Q${invalid.question_number} must add up to ${invalid.max_marks} marks before approval.`); return; }
    sessionStorage.setItem("edumind-approved-rubric", JSON.stringify(rubric));
    sessionStorage.setItem("edumind-rubric-approved", "true");
    setRubricApproved(true);
    go("upload");
  };

  const handleRubricFile = (file?: File) => { if (file) { setRubricApproved(false); sessionStorage.removeItem("edumind-rubric-approved"); setRubricFile(file); setRubricNotice("Scheme attached — ready to analyze."); } };
  const handleAnswerFile = (file?: File) => {
    if (!file) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png"];
    const extensionAllowed = /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!allowed.includes(file.type) && !extensionAllowed) { setError("Choose a PDF, JPG or PNG answer sheet."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("This file is larger than the 20 MB upload limit."); return; }
    setAnswerFile(file); setSampleAnswer(false); setUploadProgress(0); setError("");
  };

  const analyzeScheme = async () => {
    setRubricApproved(false);
    sessionStorage.removeItem("edumind-rubric-approved");
    setBusy(true); setError(""); setRubricNotice("");
    try {
      if (!demoMode || rubricFile) {
        let extracted: { questions: RubricQuestion[] };
        if (rubricFile) {
          const form = new FormData(); form.append("files", rubricFile);
          extracted = await apiRequest<{ questions: RubricQuestion[] }>("/rubrics/analyze-upload", { method: "POST", body: form, headers: {} });
        } else {
          const source = "Python Unit Test evaluation scheme. Q1 Variables and Data Types 5 marks. Q2 Loops 10 marks. Q3 Functions 10 marks. Q4 Recursion 15 marks: Base case 3, recursive call 4, correct logic 4, output tracing 2, explanation 2. Q5 File Handling 10 marks.";
          extracted = await apiRequest<{ questions: RubricQuestion[] }>("/rubrics/analyze", { method: "POST", body: JSON.stringify({ source_text: source }) });
        }
        if (extracted.questions?.length) setRubric(extracted.questions);
        else throw new Error("The local model returned no questions.");
        setRubricNotice("Rubric extracted by local AI. Review every criterion before approval.");
      } else {
        setRubric(SAMPLE_RUBRIC); setRubricNotice("Cached AI extraction loaded — review every criterion before approving the demo rubric.");
      }
      go("rubric");
    } catch (cause) {
      if (demoMode && !rubricFile) { setRubric(SAMPLE_RUBRIC); setRubricNotice("Local AI is unavailable — loaded the cached demo rubric for review."); go("rubric"); }
      else setError(cause instanceof Error ? cause.message : "Rubric analysis failed. Try the sample scheme.");
    } finally { setBusy(false); }
  };

  const startNewSubmission = () => {
    setAnswerFile(null); setSampleAnswer(false); setUploadProgress(0); setAnalysis(null);
    setPracticeScore(null); setPracticeSession(null); setRetestScore(null); setRetestSession(null);
    go("upload");
  };

  const analyzePaper = async () => {
    setBusy(true); setError(""); go("analysis");
    if (usingDemoData) {
      setAnalysisNote("Cached demo evaluation · no external AI calls");
      setUploadProgress(100);
      window.setTimeout(() => { setAnalysis({ questions: SAMPLE_RESULTS, paper_score: 31, paper_max_marks: 50, provisional_subtotal: 31, finalized: true, teacher_review_recommended: false, teacher_awarded_marks: [{ question_number: 1, awarded_marks: 5, confidence: .99, source: "vision" }, { question_number: 2, awarded_marks: 8, confidence: .98, source: "vision" }, { question_number: 3, awarded_marks: 7, confidence: .96, source: "vision" }, { question_number: 4, awarded_marks: 7, confidence: .94, source: "vision" }, { question_number: 5, awarded_marks: 7, confidence: .98, source: "vision" }], teacher_paper_score: 34, teacher_marks_status: "detected" }); setBusy(false); go("results"); }, 800);
      return;
    }
    if (!answerFile) { setBusy(false); setError("Upload an answer sheet or load the sample paper first."); go("upload"); return; }
    try {
      setUploadProgress(0);
      setAnalysisNote("Uploading your answer sheet securely…");
      const form = new FormData(); form.append("files", answerFile); form.append("rubric_json", JSON.stringify(rubric));
      const result = await apiUpload<PaperResult>("/submissions/evaluate", form, setUploadProgress);
      setAnalysis(result); setAnalysisNote("Evaluated with the configured local AI pipeline"); go("results");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Answer-sheet analysis failed."); go("upload");
    } finally { setBusy(false); }
  };

  const submitPractice = () => {
    void submitPracticeAttempt();
  };
  const submitPracticeAttempt = async () => {
    if (practiceAnswers.some((answer) => answer < 0)) { setError("Answer all five practice questions before submitting."); return; }
    if (practiceSession) {
      setBusy(true);
      try {
        const result = await apiRequest<{ score: number; results?: Array<{ question_index: number; correct: boolean; correct_answer: string; explanation: string }> }>(`/quizzes/${practiceSession}/submit`, { method: "POST", body: JSON.stringify({ answers: practiceAnswers.map((answer, question_index) => ({ question_index, answer: practiceQuestions[question_index].options[answer] })) }) });
        setPracticeReview(buildQuizReview(practiceQuestions, practiceAnswers, result.results));
        const missed = result.results?.find((item) => !item.correct)?.question_index;
        setPracticeGap(missed === undefined ? "No missed sub-concept" : `${practiceQuestions[missed]?.concept ?? "Recursion"} · ${practiceQuestions[missed]?.sub ?? "Review"}`);
        setPracticeScore(result.score); setError(""); go("quiz-result");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Quiz submission failed."); }
      finally { setBusy(false); }
      return;
    }
    const score = practiceAnswers.reduce((sum, answer, index) => sum + (answer === PRACTICE_QUESTIONS[index].answer ? 1 : 0), 0);
    setPracticeReview(buildQuizReview(PRACTICE_QUESTIONS, practiceAnswers));
    const missed = practiceAnswers.findIndex((answer, index) => answer !== PRACTICE_QUESTIONS[index].answer);
    setPracticeGap(missed < 0 ? "No missed sub-concept" : `${PRACTICE_QUESTIONS[missed].concept} · ${PRACTICE_QUESTIONS[missed].sub}`);
    setPracticeScore(score); setError(""); go("quiz-result");
  };
  const loadPracticeSample = () => { const answers = [1, 1, 2, 1, 0]; setPracticeQuestions(PRACTICE_QUESTIONS); setPracticeAnswers(answers); setPracticeReview(buildQuizReview(PRACTICE_QUESTIONS, answers)); setPracticeGap("Recursion · Termination conditions"); setPracticeScore(4); setError(""); go("quiz-result"); };
  const submitRetest = () => { void submitRetestAttempt(); };
  const submitRetestAttempt = async () => {
    if (retestAnswers.some((answer) => answer < 0)) { setError("Complete all five re-test questions first."); return; }
    if (retestSession) {
      setBusy(true);
      try {
        const result = await apiRequest<{ score: number }>(`/quizzes/${retestSession}/submit`, { method: "POST", body: JSON.stringify({ answers: retestAnswers.map((answer, question_index) => ({ question_index, answer: retestQuestions[question_index].options[answer] })) }) });
        setRetestScore(result.score * 3); setError(""); go("retest-result");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Re-test submission failed."); }
      finally { setBusy(false); }
      return;
    }
    const points = retestAnswers.reduce((sum, answer, index) => {
      const question = RETEST_QUESTIONS[index];
      return sum + (answer === question.answer ? 3 : index === 4 && answer === 2 ? 1 : 0);
    }, 0);
    setRetestScore(points); setError(""); go("retest-result");
  };
  const loadRetestSample = () => { setRetestAnswers([1, 2, 0, 0, 2]); setRetestScore(13); setError(""); go("retest-result"); };
  const showDiagnosis = async () => {
    setLearningPlan(null); go("diagnosis");
    if (usingDemoData || !analysis) return;
    const q4 = analysis.questions.find((question) => question.question_number === 4);
    if (!q4) return;
    setPlanBusy(true);
    try {
      const result = await apiRequest<LearningPlan>("/learning/plan", { method: "POST", body: JSON.stringify({
        concept: "Recursion", sub_concept: "Base cases", evidence: q4.criteria_evaluation.map((item) => item.student_evidence),
        mistake_patterns: q4.criteria_evaluation.filter((item) => item.awarded_marks < item.max_marks).map((item) => `${item.criterion}: ${item.explanation}`),
      }) });
      setLearningPlan(result);
    } catch { /* The demo learning plan remains useful when Ollama is offline. */ }
    finally { setPlanBusy(false); }
  };
  const startPractice = async () => {
    setPracticeAnswers(Array(5).fill(-1)); setPracticeScore(null); setPracticeSession(null); setPracticeQuestions(PRACTICE_QUESTIONS);
    if (!demoMode) {
      setBusy(true);
      try {
        const q4 = analysis?.questions.find((question) => question.question_number === 4);
        const generated = await apiRequest<GeneratedQuizResponse>("/quizzes/generate", { method: "POST", body: JSON.stringify({
          concept: "Recursion, Functions, and File Handling", sub_concept: "Base cases and tracing; return values; safe file access", assessment_type: "practice", count: 5,
          mistake_patterns: analysis?.questions.flatMap((question) => question.criteria_evaluation.filter((item) => item.awarded_marks < item.max_marks).map((item) => `${item.concept ?? question.question_text}: ${item.criterion} — ${item.explanation}`)).slice(0, 12) ?? q4?.criteria_evaluation.map((item) => item.criterion) ?? ["base case missing", "termination unclear"],
          previously_answered: ["Explain recursion", "Evaluate the original factorial question"],
        }) });
        if (generated.questions.length !== 5 || generated.questions.some((item) => item.options.length < 2)) throw new Error("The local quiz must cover recursion, functions, and file handling. Turn on Demo Mode for the prepared mixed-concept quiz.");
        setPracticeSession(generated.session_id);
        setPracticeQuestions(generated.questions.map((item) => ({ kind: item.question_type, concept: item.concept, sub: item.sub_concept ?? "Weak concept", prompt: item.question, options: item.options })));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The local quiz could not be generated. Turn on Demo Mode to use the cached practice set."); setBusy(false); return; }
      finally { setBusy(false); }
    }
    go("quiz");
  };
  const startRetest = async () => {
    setRetestAnswers(Array(5).fill(-1)); setRetestScore(null); setRetestSession(null); setRetestQuestions(RETEST_QUESTIONS);
    if (!demoMode && practiceSession) {
      setBusy(true);
      try {
        const generated = await apiRequest<GeneratedQuizResponse>("/quizzes/generate", { method: "POST", body: JSON.stringify({
          concept: "Recursion", sub_concept: "Base cases and termination", assessment_type: "retest", count: 5,
          mistake_patterns: ["Check base-case coverage", "Trace returns back through recursive calls"],
          previously_answered: practiceQuestions.map((item) => item.prompt),
          previous_quiz_performance: `${practiceScore ?? 0}/5 across recursion, functions, and file handling practice`, previous_session_id: practiceSession,
        }) });
        if (generated.questions.length !== 5 || generated.questions.some((item) => item.options.length < 2)) throw new Error("The local model did not return five usable re-test questions.");
        setRetestSession(generated.session_id);
        setRetestQuestions(generated.questions.map((item) => ({ kind: item.question_type, concept: item.concept ?? "Recursion", sub: item.sub_concept ?? "Base cases", prompt: item.question, options: item.options })));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "The local re-test could not be generated."); setBusy(false); return; }
      finally { setBusy(false); }
    }
    go("retest");
  };
  const loadResources = async (concept: string) => {
    const requestId = ++resourceRequestId.current;
    setResourceConcept(concept);
    setResources(RESOURCE_FALLBACKS[concept] ?? DEMO_RESOURCES);
    setLiveResources(false);
    setResourcesBusy(false);
    setResourcesBusy(true);
    const subConcept = concept === "Recursion" ? "Base cases and recursive tracing" : concept === "Functions" ? "Return values and scope" : "Safe file access and exception handling";
    try {
      const query = new URLSearchParams({ concept, sub_concept: subConcept });
      const response = await apiRequest<{ items: Array<{ video_id?: string; title: string; channel: string; duration_seconds?: number; url: string; thumbnail?: string; why_recommended?: string }> }>(`/resources/youtube?${query}`, { signal: AbortSignal.timeout(12000) });
      if (requestId !== resourceRequestId.current) return;
      if (response.items?.length) {
        setResources(response.items.map((item, index) => ({
          title: item.title, channel: item.channel, videoId: item.video_id, duration: item.duration_seconds ? `${Math.round(item.duration_seconds / 60)} min` : "Video",
          url: item.url, thumbnail: item.thumbnail, color: ["lavender", "mint", "peach"][index % 3], description: item.why_recommended ?? `Recommended for ${concept} practice.`,
        })));
        setLiveResources(true);
      }
    } catch { /* Keep the concept-specific YouTube search cards ready as fallback. */ }
    finally { if (requestId === resourceRequestId.current) setResourcesBusy(false); }
  };
  const openResources = () => {
    if (stage !== "resources") resourceReturnStage.current = stage;
    go("resources");
    void loadResources(resourceConcept);
  };

  const sendChatMessage = async (event?: FormEvent<HTMLFormElement>, followup?: string) => {
    event?.preventDefault();
    const message = (followup ?? chatDraft).trim();
    if (!message || chatBusy) return;
    const previous = chatMessages;
    setChatMessages((current) => [...current, { role: "user", content: message }]);
    setChatDraft(""); setChatBusy(true);
    const currentResults = analysis?.questions?.length ? analysis.questions : demoMode ? SAMPLE_RESULTS : [];
    const context: ChatContext = {
      exam_title: "Python Unit Test", subject: "Python Programming",
      paper_score: analysis?.paper_score ?? analysis?.provisional_subtotal ?? (demoMode ? 31 : null),
      teacher_paper_score: analysis?.teacher_paper_score ?? null,
      paper_max_marks: analysis?.paper_max_marks ?? (demoMode ? 50 : null),
      teacher_awarded_marks: analysis?.teacher_awarded_marks ?? [],
      questions: currentResults.map((question) => ({
        question_number: question.question_number,
        question_text: question.question_text ?? rubric.find((item) => item.question_number === question.question_number)?.question_text ?? "",
        question_score: question.question_score, max_marks: question.max_marks,
        criteria: question.criteria_evaluation.map((item) => ({
          criterion: item.criterion, expected: item.expected,
          student_evidence: item.student_evidence, status: item.status,
          awarded_marks: item.awarded_marks, max_marks: item.max_marks, explanation: item.explanation,
        })),
      })),
    };
    try {
      const response = await apiRequest<{ answer: string; suggested_followups: string[] }>("/learning/chat", {
        method: "POST", signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ message, context, history: previous.slice(-8).map(({ role, content }) => ({ role, content })) }),
      });
      setChatMessages((current) => [...current, { role: "assistant", content: response.answer, suggested_followups: response.suggested_followups }]);
    } catch (cause) {
      const fallback = demoMode ? buildDemoChatReply(message, context) : null;
      setChatMessages((current) => [...current, { role: "assistant", content: fallback ?? (cause instanceof Error && cause.name === "TimeoutError" ? "EDU took too long to respond. Check that Ollama is running, then try again." : "I couldn’t reach the local study model. Check that Ollama is running and try again.") }]);
    } finally { setChatBusy(false); }
  };

  const orderedStages: Stage[] = ["home", "teacher", "rubric", "upload", "analysis", "results", "diagnosis", "practice", "quiz", "quiz-result", "retest", "retest-result", "resources"];
  const currentIndex = orderedStages.indexOf(stage);
  const rubricScore = analysis?.paper_score ?? analysis?.provisional_subtotal ?? 31;
  const score = analysis?.teacher_paper_score ?? rubricScore;
  const percent = Math.round((score / (analysis?.paper_max_marks || 50)) * 100);
  const finishIntro = () => { localStorage.setItem("eduplus-intro-seen", "true"); setShowIntro(false); setWorldEnabled(true); };
  const companionState = error ? "warning" : stage === "analysis" ? "analyzing" : ["quiz-result", "retest-result"].includes(stage) ? "celebrating" : stage === "quiz" || stage === "retest" ? "studying" : stage === "diagnosis" ? "thinking" : "idle";
  const companionMessage = error ? "Let's check that step." : stage === "analysis" ? "Mapping answers to your rubric…" : stage === "results" ? "I found where those marks went." : stage === "diagnosis" ? "A clear next step is ready." : ["quiz-result", "retest-result"].includes(stage) ? "Look at that progress!" : stage === "quiz" || stage === "retest" ? "Take your time. You've got this." : "Ready when you are.";

  return (
    <div className="app-root">
      {worldEnabled && <Suspense fallback={null}><ImmersiveWorld mode={visualMode} home={stage === "home"} /></Suspense>}
      <Suspense fallback={null}><BootSequence open={showIntro} onFinish={finishIntro} />{stage === "analysis" && <EDUMascot state={companionState} message={companionMessage} />}</Suspense>
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand-lockup"><img src="/edupulse-logo.svg" alt="EduPulse — Understand, Practice, Improve" /><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19} /></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">P</div><div><strong>Python Programming</strong><span>Student workspace</span></div></div>
        <div className="nav-heading">DEMO JOURNEY</div>
        <nav className="journey-nav">
          {STAGES.map((item, index) => {
            const prev = STAGES[index - 1];
            const needsPaper = ["results", "diagnosis", "practice"].includes(item.id);
            const navDisabled = (item.id === "upload" && !rubricApproved)
              || (needsPaper && !analysis && !demoMode)
              || (item.id === "retest" && practiceScore === null);
            const navTitle = navDisabled
              ? item.id === "upload" ? "Approve the teacher rubric first."
                : needsPaper ? "Analyze an answer sheet first."
                  : item.id === "retest" ? "Complete the practice quiz first."
                    : "Complete the re-test first."
              : undefined;
            return <div key={item.id}>
              {item.group !== prev?.group && <p className="nav-group-label">{item.group}</p>}
              <button className={`nav-item ${stage === item.id || (item.id === "results" && ["analysis"].includes(stage)) ? "active" : ""} ${currentIndex > orderedStages.indexOf(item.id) ? "completed" : ""}`} disabled={navDisabled} title={navTitle} onClick={() => {
                if (item.id === "rubric" && stage === "teacher") { void analyzeScheme(); return; }
                if (item.id === "diagnosis") { void showDiagnosis(); return; }
                if (item.id === "practice") { go("practice"); return; }
                if (item.id === "retest") { void startRetest(); return; }
                if (item.id === "resources") { openResources(); return; }
                go(item.id);
              }}>
                <span className="nav-icon">{currentIndex > orderedStages.indexOf(item.id) ? <Check size={14} /> : <StageIcon stage={item.id} />}</span>
                <span>{item.label}</span>{stage === item.id && <span className="nav-current" />}
              </button>
            </div>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-switch-card"><div className="demo-switch-top"><span className="demo-indicator" /><strong>Demo mode</strong><button className={`switch ${demoMode ? "switch-on" : ""}`} onClick={() => setDemoMode(!demoMode)} aria-label="Toggle demo mode" aria-pressed={demoMode}><span /></button></div><p>{demoMode ? "Cached sample data keeps the journey ready." : "Use local AI and connected resources."}</p></div>
          <label className="visual-mode-control">VISUAL MODE<select value={visualMode} onChange={(event) => setVisualMode(event.target.value as typeof visualMode)}><option value="cinematic">Cinematic</option><option value="balanced">Balanced</option><option value="performance">Performance</option></select></label>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><span className="breadcrumb-muted">Python Unit Test</span><ChevronRight size={14} /><span>{stageLabel(stage)}</span></div>
          <div className="topbar-right"><button className="ask-edu-button" onClick={() => setChatOpen(true)}><MessageCircle size={15}/> Ask EDU</button><span className={`local-status ${aiAvailable ? "online" : "offline"}`}><span />{aiAvailable ? "Local AI ready" : demoMode ? "Demo data ready" : "Local AI offline"}</span><div className="top-avatar">AM</div></div>
        </header>

        <main className="main-content">
          {error && <div className="error-banner"><CircleHelp size={17} /><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
          <AnimatePresence mode="wait" initial={false}><motion.div className="stage-transition" key={stage} initial={{ opacity: 0, y: 14, scale: .986, filter: "blur(5px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, scale: .994, filter: "blur(4px)" }} transition={{ duration: .34, ease: "easeOut" }}>
          {stage === "home" && <HomePage score={score} percent={percent} hasAnalysis={Boolean(analysis)} demoMode={demoMode} companionState={companionState} companionMessage={companionMessage} onUpload={() => go(rubricApproved ? "upload" : "teacher")} onAnalysis={() => go(analysis || demoMode ? "results" : "teacher")} onPractice={() => analysis || demoMode ? go("practice") : go("teacher")} />}
          {stage === "teacher" && <TeacherPage demoMode={demoMode} rubricFile={rubricFile} notice={rubricNotice} busy={busy} onFile={handleRubricFile} onAnalyze={analyzeScheme} onDemo={() => { setRubricApproved(false); sessionStorage.removeItem("edumind-rubric-approved"); setRubricFile(null); setRubric(SAMPLE_RUBRIC); setRubricNotice("Sample evaluation scheme loaded."); }} />}
          {stage === "rubric" && <RubricPage rubric={rubric} notice={rubricNotice} onEdit={setCriterion} onBack={() => go("teacher")} onApprove={approveRubric} />}
          {stage === "upload" && <UploadPage demoMode={demoMode} file={answerFile} sampleLoaded={sampleAnswer} uploadProgress={uploadProgress} onFile={handleAnswerFile} onDemo={() => { setSampleAnswer(true); setAnswerFile(null); setUploadProgress(100); setError(""); }} onAnalyze={analyzePaper} onBack={() => go("rubric")} busy={busy} />}
          {stage === "analysis" && <AnalysisProgress note={analysisNote} demoMode={usingDemoData} />}
          {stage === "results" && <ResultsPage analysis={analysis} demoMode={sampleAnswer || (demoMode && !answerFile)} score={rubricScore} expandedQuestion={expandedQuestion} onExpand={setExpandedQuestion} onDiagnosis={showDiagnosis} onUploadAgain={startNewSubmission} onSaveTeacherMarks={(marks) => setAnalysis((current) => {
            if (!current) return current;
            const merged = new Map((current.teacher_awarded_marks ?? []).map((item) => [item.question_number, item]));
            marks.forEach((item) => merged.set(item.question_number, { ...item, source: "manual", evidence: "Entered from the teacher-corrected paper." }));
            const teacher_awarded_marks = [...merged.values()].sort((a, b) => a.question_number - b.question_number);
            const teacher_paper_score = teacher_awarded_marks.length === current.questions.length
              ? teacher_awarded_marks.reduce((sum, item) => sum + item.awarded_marks, 0)
              : current.teacher_paper_score;
            return { ...current, teacher_awarded_marks, teacher_paper_score, teacher_marks_status: "detected" };
          })} />}
          {stage === "diagnosis" && <DiagnosisPage plan={learningPlan} planBusy={planBusy} busy={busy} onQuiz={startPractice} />}
          {stage === "practice" && <PracticePage ready={Boolean(analysis) || demoMode} busy={busy} onStart={startPractice} onAnalysis={() => go("results")} onUpload={() => go(rubricApproved ? "upload" : "teacher")} />}
          {stage === "quiz" && <QuizPage questions={practiceQuestions} answers={practiceAnswers} setAnswers={setPracticeAnswers} onSubmit={submitPractice} onSample={loadPracticeSample} allowSample={usingDemoData} busy={busy} onBack={() => go("diagnosis")} title="Recursion recovery" subtitle="Five questions · built around the gaps in your answer" error={error} />}
          {stage === "quiz-result" && <QuizResultPage score={practiceScore ?? 4} gap={practiceGap} review={practiceReview} onRetest={startRetest} onBack={() => go("results")} />}
          {stage === "retest" && <QuizPage questions={retestQuestions} answers={retestAnswers} setAnswers={setRetestAnswers} onSubmit={submitRetest} onSample={loadRetestSample} allowSample={usingDemoData} busy={busy} onBack={() => go("quiz-result")} title="Recursion re-test" subtitle="Five fresh questions · checks transfer, tracing and termination" error={error} />}
          {stage === "retest-result" && <RetestResultPage score={retestScore ?? 13} practiceScore={practiceScore ?? 4} onResources={openResources} onDashboard={() => go("results")} />}
          {stage === "resources" && <ResourcesPage resources={resources} concept={resourceConcept} live={liveResources} loading={resourcesBusy} onConcept={loadResources} onBack={() => go(resourceReturnStage.current)} onQuiz={startPractice} />}
          </motion.div></AnimatePresence>
        </main>
        <footer className="app-footer"><span>EDUPULSE <span className="footer-dot">·</span> explainable assessment</span><span>Python Unit Test <span className="footer-dot">·</span> {stage === "teacher" || stage === "rubric" ? "Teacher view" : "Student view"}</span></footer>
      </div>
      {chatOpen && createPortal(<StudentChatPanel messages={chatMessages} draft={chatDraft} busy={chatBusy} localAI={Boolean(aiAvailable)} demoMode={demoMode} endRef={chatEndRef} onDraft={setChatDraft} onSend={sendChatMessage} onClose={() => setChatOpen(false)} />, document.body)}
    </div>
  );
}

function HomePage({ score, percent, hasAnalysis, demoMode, companionState, companionMessage, onUpload, onAnalysis, onPractice }: { score: number; percent: number; hasAnalysis: boolean; demoMode: boolean; companionState: "idle" | "thinking" | "analyzing" | "celebrating" | "warning" | "studying"; companionMessage: string; onUpload: () => void; onAnalysis: () => void; onPractice: () => void }) {
  const ready = hasAnalysis || demoMode;
  const concepts = [{ name: "Recursion", value: 33, loss: 10, tint: "weak" }, { name: "Functions", value: 60, loss: 4, tint: "medium" }, { name: "File Handling", value: 70, loss: 3, tint: "medium" }];
  return <div className="page-wrap command-page home-clean">
    <section className="home-welcome panel">
      <div className="home-welcome-copy"><span className="home-eyebrow"><span className="status-dot"/> PYTHON PROGRAMMING · UNIT TEST</span><h1>{ready ? "Your latest analysis is ready." : "Let’s make every mark make sense."}</h1><p>{ready ? "You have a clear picture of what’s working and what to focus on next." : "Upload an answer sheet to get feedback tied to your teacher’s marking scheme."}</p>
      <div className="home-primary-actions">{ready ? <><button className="button button-primary" onClick={onAnalysis}>View my analysis <ArrowRight size={16}/></button><button className="text-action" onClick={onUpload}>Upload another paper</button></> : <button className="button button-primary" onClick={onUpload}><Upload size={16}/> Upload answer sheet <ArrowRight size={16}/></button>}</div></div>
      {ready && <div className="home-score"><span>LATEST RESULT</span><strong>{score}<small> / 50</small></strong><b>{percent}%</b><small>{hasAnalysis ? "Your assessed paper" : "Sample paper · demo mode"}</small></div>}
      <Suspense fallback={null}><EDUMascot state={companionState} message={companionMessage} /></Suspense>
    </section>
    <div className="home-main-grid">
      <section className="panel home-exam-card"><div className="home-section-head"><div><span className="panel-kicker">CONTINUE WHERE YOU LEFT OFF</span><h2>Python Unit Test</h2><p>Python Programming · 5 questions · 50 marks</p></div><span className="home-exam-icon"><GraduationCap size={21}/></span></div><div className="home-exam-footer"><span className={`status-pill ${ready ? "approved-chip" : "draft-pill"}`}>{ready ? "ANALYSIS READY" : "READY TO START"}</span><button className="button button-secondary" onClick={ready ? onAnalysis : onUpload}>{ready ? "Review feedback" : "Open exam"}<ArrowRight size={15}/></button></div></section>
      <section className="panel home-progress-card"><div className="home-section-head"><div><span className="panel-kicker">YOUR PROGRESS</span><h2>{ready ? `${percent}% performance signal` : "No results yet"}</h2></div><span className="home-progress-orb">{ready ? `${percent}%` : "—"}</span></div><div className="home-progress-track"><i style={{width:`${ready ? percent : 0}%`}}/></div><p>{ready ? "2 concepts are strong · 3 could use more practice" : "Analyze your first paper to see your concept strengths."}</p></section>
    </div>
    <section className="panel home-focus-panel"><div className="home-section-head"><div><span className="panel-kicker">YOUR FOCUS AREAS</span><h2>Three concepts to strengthen</h2></div><button className="text-action" onClick={onAnalysis}>See full analysis <ArrowRight size={14}/></button></div><div className="home-focus-list">{concepts.map((concept) => <div className="home-focus-row" key={concept.name}><span className={`focus-status-dot ${concept.tint}`}/><b>{concept.name}</b><span className="home-focus-track"><i className={concept.tint} style={{width:`${concept.value}%`}}/></span><span className="home-focus-value">{concept.value}%</span><span className="home-focus-loss">−{concept.loss} marks</span></div>)}</div></section>
    <section className="home-next-step"><div className="next-step-mark"><Target size={19}/></div><div className="next-step-copy"><span className="panel-kicker">YOUR NEXT STEP</span><h2>Start with recursion</h2><p>You earned 5/15 on this question. The base case and termination logic are good places to begin.</p></div><button className="button button-primary" onClick={ready ? onPractice : onUpload}>{ready ? "Practice recursion" : "Upload a paper first"}<ArrowRight size={16}/></button></section>
  </div>;
}

function StageIcon({ stage }: { stage: Stage }) {
  const props = { size: 15, strokeWidth: 1.9 };
  if (["teacher", "rubric"].includes(stage)) return <ClipboardCheck {...props} />;
  if (stage === "upload") return <Upload {...props} />;
  if (["results", "analysis"].includes(stage)) return <FileText {...props} />;
  if (["diagnosis", "practice"].includes(stage)) return <Target {...props} />;
  if (["quiz", "quiz-result", "retest", "retest-result"].includes(stage)) return <Zap {...props} />;
  return <BookOpen {...props} />;
}

function stageLabel(stage: Stage) {
  const labels: Record<Stage, string> = { home: "Learning station", teacher: "Teacher dashboard", rubric: "Rubric review", upload: "Answer sheet", analysis: "Analysis", results: "Paper analysis", diagnosis: "Learning signal", practice: "Practice", quiz: "Personalized practice", "quiz-result": "Practice result", retest: "Re-test", "retest-result": "Improvement", resources: "Learning resources" };
  return labels[stage];
}

function buildDemoChatReply(message: string, context: ChatContext): string {
  const text = message.toLowerCase();
  const questionMatch = text.match(/\bq(?:uestion)?\s*(\d+)\b/);
  const lostQuestion = [...context.questions].sort((a, b) => (b.max_marks - b.question_score) - (a.max_marks - a.question_score))[0];
  if (/mark|score|grade|lost|lose|deduct|rubric|\bq\d/.test(text) && context.paper_score !== null && context.paper_max_marks !== null) {
    const question = (questionMatch ? context.questions.find((item) => item.question_number === Number(questionMatch[1])) : undefined) ?? lostQuestion;
    if (!question) return `Your current paper score is ${context.paper_score}/${context.paper_max_marks}. I don’t have question-level rubric evidence for this paper yet.`;
    const gaps = question.criteria.filter((item) => item.awarded_marks < item.max_marks);
    const topGap = gaps.sort((a, b) => (b.max_marks - b.awarded_marks) - (a.max_marks - a.awarded_marks))[0];
    const teacherQuestion = context.teacher_awarded_marks.find((item) => item.question_number === question.question_number);
    const summary = context.teacher_paper_score === null
      ? `EDUPULSE's rubric-based review matched ${context.paper_score}/${context.paper_max_marks}. Q${question.question_number} (${question.question_text}) received ${question.question_score}/${question.max_marks} by rubric evidence; up to ${question.max_marks - question.question_score} rubric marks were not evidenced.`
      : `Your teacher awarded ${context.teacher_paper_score}/${context.paper_max_marks}. EDUPULSE matched ${context.paper_score}/${context.paper_max_marks} to the rubric evidence. Q${question.question_number} (${question.question_text}) received ${teacherQuestion?.awarded_marks ?? "no entered teacher mark"}/${question.max_marks} from your teacher and ${question.question_score}/${question.max_marks} in the EDUPULSE rubric review; up to ${question.max_marks - question.question_score} rubric marks were not evidenced.`;
    if (!topGap) return `${summary} Every criterion on this question received full marks.`;
    return `${summary}\n\nFor “${topGap.criterion}”, the rubric expected ${topGap.expected.join("; ")}. The evaluation evidence says: ${topGap.student_evidence} ${topGap.explanation} Potential marks are not a promise of a grade change; your teacher's rubric remains the source of truth.`;
  }
  if (/study|what next|focus|practice|improve/.test(text) && context.questions.length) {
    const question = lostQuestion;
    const gap = question?.criteria.filter((item) => item.awarded_marks < item.max_marks).sort((a, b) => (b.max_marks - b.awarded_marks) - (a.max_marks - a.awarded_marks))[0];
    return question && gap ? `Start with ${question.question_text}, especially “${gap.criterion}”. In your Q${question.question_number} answer, the evaluator found: ${gap.student_evidence} The rubric expects ${gap.expected.join("; ")}. Work on that idea first, then try a new question before moving to the other lost-mark areas.` : "Start with one concept from your latest feedback, practice it with a new problem, then re-check your reasoning.";
  }
  if (/recurs|base case|termination|factorial/.test(text)) return "A recursive function needs a base case: a simple input where it returns without calling itself again. For factorial, `fact(0)` can return 1. Each recursive call should move closer to that case, such as `fact(n - 1)`. In your paper, the recursive call was present; the evaluation flagged the missing stopping condition.";
  if (/function|return|print|scope|parameter/.test(text)) return "In Python, `print(value)` displays a value, while `return value` sends it back to the code that called the function. A function with no explicit `return` gives back `None`. Try assigning the function call to a variable to see the difference.";
  if (/file|open|read|write|exception/.test(text)) return "A `with open(path) as file:` block is a safe starting pattern. It closes the file when the block ends, even if an error occurs. Then choose a mode such as `r` for reading or `w` for writing, and handle expected file errors where appropriate.";
  return "I can help with your paper marks, recursion, Python functions, or file handling. For a more specific answer, include the question number or the concept you’re studying.";
}

function StudentChatPanel({ messages, draft, busy, localAI, demoMode, endRef, onDraft, onSend, onClose }: { messages: ChatMessage[]; draft: string; busy: boolean; localAI: boolean; demoMode: boolean; endRef: RefObject<HTMLDivElement | null>; onDraft: (value: string) => void; onSend: (event?: FormEvent<HTMLFormElement>, followup?: string) => void; onClose: () => void }) {
  const starterQuestions = ["Why did I lose marks on Q4?", "Explain recursion base cases", "What should I study next?"];
  return <div className="edu-chat-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="edu-chat-panel" aria-label="Ask EDU study helper">
    <header className="edu-chat-header"><div className="edu-chat-avatar"><Sparkles size={18}/></div><div><b>Ask EDU</b><span>{localAI ? "Local study helper" : demoMode ? "Demo helper · local AI offline" : "Local AI unavailable"}</span></div><button onClick={onClose} aria-label="Close Ask EDU"><X size={18}/></button></header>
    <div className="edu-chat-context"><LockKeyhole size={13}/><span>Can use your Python Unit Test rubric and feedback to answer mark questions.</span></div>
    <div className="edu-chat-messages">{messages.map((item, index) => <article className={`edu-chat-message ${item.role}`} key={`${index}-${item.role}`}><span className="chat-message-avatar">{item.role === "assistant" ? <Sparkles size={13}/> : <UserRound size={13}/>}</span><div className="chat-message-body"><p>{item.content}</p>{item.suggested_followups?.length ? <div className="chat-followups">{item.suggested_followups.map((prompt) => <button key={prompt} onClick={() => onSend(undefined, prompt)}>{prompt}<ArrowRight size={12}/></button>)}</div> : null}</div></article>)}{messages.length === 1 && <div className="chat-starters">{starterQuestions.map((prompt) => <button key={prompt} onClick={() => onSend(undefined, prompt)}>{prompt}</button>)}</div>}{busy && <div className="chat-thinking"><span className="tiny-loader"/> EDU is thinking…</div>}<div ref={endRef}/></div>
    <form className="edu-chat-compose" onSubmit={(event) => onSend(event)}><textarea value={draft} onChange={(event) => onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Ask about a mark or study concept…" rows={2} maxLength={1200}/><button className="button button-primary" disabled={!draft.trim() || busy} aria-label="Send question"><Send size={16}/></button><small>Enter to send · Shift + Enter for a new line</small></form>
  </section></div>;
}

function TeacherPage({ demoMode, rubricFile, notice, busy, onFile, onAnalyze, onDemo }: { demoMode: boolean; rubricFile: File | null; notice: string; busy: boolean; onFile: (file?: File) => void; onAnalyze: () => void; onDemo: () => void }) {
  const [dragging, setDragging] = useState(false);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); };
  return <div className="page-wrap">
    <div className="welcome-row"><div><div className="eyebrow-tag"><span className="sparkle-dot">✦</span> TEACHER WORKSPACE <span className="tag-divider">/</span> EXAM SETUP</div><h1 className="page-title">Make every mark <span>make sense.</span></h1><p className="page-subtitle">Start with the rubric. Give every student clear, evidence-backed feedback.</p></div><div className="floating-grade"><div className="grade-spark">✦</div><span>AI-ASSISTED</span><strong>Human approved</strong></div></div>
    <div className="teacher-grid">
      <section className="panel exam-panel">
        <div className="panel-top"><div className="panel-icon violet"><GraduationCap size={19} /></div><div><div className="panel-kicker">YOUR EXAM</div><h2>Python Unit Test</h2></div><span className="status-pill draft-pill">DRAFT</span></div>
        <div className="exam-facts"><div><span>Subject</span><strong>Python Programming</strong></div><div><span>Total marks</span><strong>50 marks</strong></div><div><span>Questions</span><strong>5 questions</strong></div><div><span>Exam type</span><strong>Unit assessment</strong></div></div>
        <div className="exam-decoration"><div className="mini-paper"><div /><div /><div /><div /></div><div className="decoration-copy"><b>Built for better feedback</b><span>Teacher scheme stays the source of truth.</span></div><Sparkles className="decor-star" size={25} /></div>
      </section>
      <section className="panel scheme-panel">
        <div className="section-head"><div><div className="panel-kicker">STEP 01 · TEACHER</div><h2>Evaluation scheme</h2><p>Upload your marking guide or start with the prepared demo.</p></div><span className="icon-bubble"><FileText size={18} /></span></div>
        <div className={`dropzone ${dragging ? "dropzone-active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf" id="rubric-input" onChange={(event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0])} />
          <div className="upload-cloud"><Upload size={21} /></div><strong>{rubricFile ? rubricFile.name : "Drop the scheme here"}</strong><span>{rubricFile ? "Scheme attached and ready" : "PDF, JPG or PNG · up to 20 MB"}</span>
          <label htmlFor="rubric-input" className="browse-button">Browse files</label>
        </div>
        <div className="or-row"><span />or<span /></div>
        <button className="sample-scheme-button" onClick={onDemo}><span className="sample-file-icon"><FileText size={18} /></span><span><b>Load sample evaluation scheme</b><small>Python Unit Test · 5 questions · 50 marks</small></span><ChevronRight size={18} /></button>
        {notice && <div className="inline-notice"><CheckCircle2 size={16} />{notice}</div>}
        <div className="panel-actions"><span className="trust-note"><LockKeyhole size={14} /> {demoMode ? "Demo mode is on" : "Processed by local AI"}</span><button className="button button-primary" onClick={onAnalyze} disabled={busy}>{busy ? <><span className="button-spinner" /> Analyzing</> : <>Analyze evaluation scheme <ArrowRight size={17} /></>}</button></div>
      </section>
    </div>
    <div className="teacher-trust-row"><div><div className="trust-avatar purple-avatar"><ClipboardCheck size={16} /></div><span><b>Rubric first.</b> Every mark ties back to your criteria.</span></div><div><div className="trust-avatar green-avatar"><CheckCircle2 size={16} /></div><span><b>You approve.</b> Review and edit before students see feedback.</span></div><div><div className="trust-avatar peach-avatar"><LockKeyhole size={16} /></div><span><b>Local by default.</b> Student work stays private.</span></div></div>
    <div className="floating-note float-note-teacher"><Sparkles size={14} /> no black-box grades</div>
  </div>;
}

function RubricPage({ rubric, notice, onEdit, onBack, onApprove }: { rubric: RubricQuestion[]; notice: string; onEdit: (q: number, c: number, field: "description" | "max_marks", v: string) => void; onBack: () => void; onApprove: () => void }) {
  const total = rubric.reduce((sum, question) => sum + question.max_marks, 0);
  return <div className="page-wrap">
    <div className="page-toolbar"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to exam setup</button><span className="ai-source-chip"><Sparkles size={13} /> {notice.includes("cached") || notice.includes("Sample") ? "DEMO EXTRACTION" : "LOCAL AI EXTRACTION"}</span></div>
    <div className="rubric-hero"><div><div className="eyebrow-tag">STEP 02 · HUMAN REVIEW <span className="tag-divider">/</span> RUBRIC</div><h1 className="page-title">Check the <span>marking guide.</span></h1><p className="page-subtitle">AI structured the scheme. You own every mark before it goes live.</p></div><div className="total-mark-card"><span>Total marks</span><strong>{total}<small> / 50</small></strong><span className="total-mark-check"><CheckCircle2 size={14} /> scheme parsed</span></div></div>
    {notice && <div className="review-callout"><Lightbulb size={17} /><div><b>Teacher review required</b><span>{notice}</span></div><span className="callout-lock"><LockKeyhole size={15} /> Not active yet</span></div>}
    <div className="rubric-list">{rubric.map((question, qi) => <section className={`rubric-question ${question.question_number === 4 ? "focus-question" : ""}`} key={question.question_number}>
      <div className="rubric-q-head"><div className="q-number">Q{question.question_number}</div><div className="rubric-q-title"><h3>{question.question_text}</h3><span>{question.concepts?.join(" · ") || "Python Programming"}</span></div><div className="marks-edit"><input aria-label={`Question ${question.question_number} max marks`} type="number" value={question.max_marks} readOnly /><span>marks</span></div></div>
      <div className="criteria-table"><div className="criteria-header"><span>RUBRIC CRITERION</span><span>MAX MARKS</span><span>EXPECTED ELEMENTS</span></div>{question.criteria.map((criterion, ci) => <div className="criteria-row" key={criterion.id}><div className="criterion-description-edit"><span className="criterion-bullet" /><input aria-label="Edit criterion" value={criterion.description} onChange={(event) => onEdit(qi, ci, "description", event.target.value)} /><small>{criterion.sub_concept || criterion.id}</small></div><label className="criterion-marks"><input type="number" min="0" max={question.max_marks} value={criterion.max_marks} onChange={(event) => onEdit(qi, ci, "max_marks", event.target.value)} /><span>marks</span></label><span className="expected-elements">{criterion.expected_elements?.join(" · ")}</span></div>)}</div>
    </section>)}</div>
    <div className="approve-sticky"><div><CheckCircle2 size={19} /><span><b>Ready to activate?</b><small>The approved rubric will guide every student evaluation.</small></span></div><button className="button button-primary" onClick={onApprove}>Approve rubric <Check size={17} /></button></div>
  </div>;
}

function UploadPage({ demoMode, file, sampleLoaded, uploadProgress, onFile, onDemo, onAnalyze, onBack, busy }: { demoMode: boolean; file: File | null; sampleLoaded: boolean; uploadProgress: number; onFile: (file?: File) => void; onDemo: () => void; onAnalyze: () => void; onBack: () => void; busy: boolean }) {
  const [dragging, setDragging] = useState(false);
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); };
  return <div className="page-wrap upload-page">
    <div className="page-toolbar"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to rubric</button><span className="approved-chip"><CheckCircle2 size={14} /> RUBRIC APPROVED</span></div>
    <div className="upload-heading"><div className="eyebrow-tag">STEP 03 · STUDENT <span className="tag-divider">/</span> SUBMISSION</div><h1 className="page-title">Your paper, <span>understood.</span></h1><p className="page-subtitle">We’ll match what you wrote to your teacher’s rubric, question by question.</p></div>
    <div className="upload-content-grid">
      <section className="panel upload-panel"><div className="upload-panel-head"><div><div className="panel-kicker">PYTHON UNIT TEST</div><h2>Upload answer sheet</h2></div><span className="exam-total"><strong>50</strong><small>marks</small></span></div>
        <div className={`dropzone answer-drop ${dragging ? "dropzone-active" : ""} ${file || sampleLoaded ? "has-file" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" id="answer-input" onChange={(event: ChangeEvent<HTMLInputElement>) => { onFile(event.target.files?.[0]); event.target.value = ""; }} />
          <div className="upload-cloud"><Upload size={22} /></div>
          <strong>{sampleLoaded ? "Sample answer sheet loaded" : file?.name || "Drop your answer sheet"}</strong>
          <span>{sampleLoaded ? "Alex Morgan · 5 questions · ready to analyze" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ready to analyze` : "PDF, JPG or PNG · multiple pages supported"}</span>
          {!sampleLoaded && <label htmlFor="answer-input" className="browse-button">{file ? "Choose a different file" : "Choose answer sheet"}</label>}
          {(file || sampleLoaded) && <div className="file-ready"><span className="file-ready-icon"><FileText size={16} /></span><div><b>{sampleLoaded ? "python-unit-test-alex.pdf" : file?.name}</b><small>{sampleLoaded ? "5 pages · sample submission" : busy ? `Sending to EDUPULSE · ${uploadProgress}%` : `${(file!.size / 1024 / 1024).toFixed(2)} MB · ready to submit`}</small></div><CheckCircle2 size={17} /></div>}
        </div>
        <div className="upload-progress-track"><span style={{ width: `${file || sampleLoaded ? 100 : 0}%` }} /></div>
        <div className="or-row"><span />or<span /></div>
        <button className="sample-scheme-button" onClick={onDemo}><span className="sample-file-icon sample-answer-icon"><Sparkles size={18} /></span><span><b>Load sample answer sheet</b><small>Alex Morgan · prepared demo paper · 31/50</small></span><ChevronRight size={18} /></button>
        <div className="panel-actions upload-actions"><span className="trust-note"><LockKeyhole size={14} /> {demoMode ? "Demo Mode · cached evaluation" : "Private local processing"}</span><button className="button button-primary" onClick={onAnalyze} disabled={busy || (!file && !sampleLoaded)}>{busy ? <><span className="button-spinner" /> Analyzing</> : <>Analyze answer sheet <Sparkles size={16} /></>}</button></div>
      </section>
      <aside className="upload-side-card"><div className="side-card-illustration"><div className="paper-illustration"><div className="paper-label">ANSWER SHEET <span>✦</span></div><div className="paper-line long" /><div className="paper-line" /><div className="scribble">f(n−1)</div><div className="paper-line short" /><div className="paper-highlight">base case?</div><div className="paper-line long" /></div><div className="orbit-chip orbit-chip-one"><Check size={13} /> 5 questions</div><div className="orbit-chip orbit-chip-two"><Sparkles size={13} /> evidence first</div><span className="illo-spark one">✦</span><span className="illo-spark two">✳</span></div><h3>Not just a score.</h3><p>Understand where marks went, what you already know, and what to focus on next.</p><div className="privacy-caption"><LockKeyhole size={14} /> Your answer stays private</div></aside>
    </div>
  </div>;
}

function AnalysisProgress({ note, demoMode }: { note: string; demoMode: boolean }) {
  const steps = ["Reading answer sheet", "Detecting question boundaries", "Extracting student answers", "Reading visible teacher marks", "Matching answers to teacher rubric", "Evaluating criterion evidence", "Finding concepts to strengthen", "Building a targeted recovery plan"];
  const [progress, setProgress] = useState(demoMode ? steps.length : 3);
  useEffect(() => {
    if (!demoMode) return;
    let current = 0;
    const timer = window.setInterval(() => { current += 1; setProgress(current); if (current >= steps.length) window.clearInterval(timer); }, 90);
    return () => window.clearInterval(timer);
  }, [demoMode, steps.length]);
  return <div className="progress-page"><div className="progress-orbit"><div className="orbit-ring ring-a" /><div className="orbit-ring ring-b" /><div className="scan-sheet"><small>ANSWER SHEET · PAGE 01</small><i/><i/><i className="short-line"/><b>def fact(n):</b><i/><b>n × fact(n − 1)</b><i className="short-line"/><span className="scan-beam"/><em>Q4 · RECURSION</em></div><div className="progress-core"><div className="progress-core-logo"><Sparkles size={23} /></div><span>EDU</span></div><div className="orbit-token token-file"><FileText size={17} /></div><div className="orbit-token token-check"><Check size={16} /></div><div className="orbit-token token-brain"><Lightbulb size={16} /></div><div className="orbit-token token-target"><Target size={16} /></div><div className="scan-data-particle particle-a"/><div className="scan-data-particle particle-b"/><div className="scan-data-particle particle-c"/></div><div className="eyebrow-tag centered-tag">{demoMode ? "CACHED DEMO ANALYSIS" : "LOCAL AI PIPELINE"}</div><h1 className="progress-title">Reading between<br />the <span>lines.</span></h1><p className="progress-subtitle">Reading student answers and any teacher-awarded marks visible on the uploaded pages.</p><div className="progress-checklist">{steps.map((step, index) => <div className={`progress-item ${index < progress ? "done" : index === progress ? "current" : "pending"}`} key={step}><span>{index < progress ? <Check size={13} /> : index === progress ? <span className="tiny-loader" /> : <span className="progress-empty" />}</span><b>{step}</b>{index < progress && <small>Complete</small>}</div>)}</div><div className="progress-note"><LockKeyhole size={14} /> {note || (demoMode ? "Using pre-analyzed sample data to keep the demo instant." : "Your pages are processed by the local model.")}</div></div>;
}

function TeacherMarksPanel({ questions, savedMarks, teacherScore, rubricScore, maxMarks, status, review, demoMode, onSave }: { questions: QuestionResult[]; savedMarks: TeacherQuestionMark[]; teacherScore?: number; rubricScore: number; maxMarks: number; status?: "detected" | "uncertain" | "not_found"; review: TeacherMarkIssue[]; demoMode: boolean; onSave: (marks: TeacherQuestionMark[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<number, string>>(() => Object.fromEntries(savedMarks.map((item) => [item.question_number, String(item.awarded_marks)])));
  const [error, setError] = useState("");
  useEffect(() => {
    setValues(Object.fromEntries(savedMarks.map((item) => [item.question_number, String(item.awarded_marks)])));
  }, [savedMarks]);
  const submit = () => {
    const marks: TeacherQuestionMark[] = [];
    for (const question of questions) {
      const raw = values[question.question_number];
      if (raw === undefined || raw.trim() === "") continue;
      const awarded = Number(raw);
      if (!Number.isFinite(awarded) || awarded < 0 || awarded > question.max_marks) {
        setError(`Enter teacher-awarded marks from 0 to ${question.max_marks} for Q${question.question_number}.`);
        return;
      }
      const existing = savedMarks.find((item) => item.question_number === question.question_number);
      if (existing && existing.awarded_marks === awarded) continue;
      marks.push({ question_number: question.question_number, awarded_marks: awarded });
    }
    if (!marks.length) { setError("No manual marks entered. The marks already detected from the paper are unchanged."); return; }
    setError(""); onSave(marks); setEditing(false);
  };
  const delta = teacherScore === undefined ? null : teacherScore - rubricScore;
  const marksDetected = savedMarks.length;
  return <section className="teacher-marks-panel">
    <div className="teacher-marks-heading"><div><span className="panel-kicker">TEACHER MARKS · READ FROM UPLOADED PAPER</span><h2>{teacherScore === undefined ? "Teacher-awarded marks" : "Teacher and rubric scores"}</h2><p>EDUPULSE reads visible question scores from the uploaded corrected paper and checks them against the approved rubric.</p></div>{!editing && (teacherScore !== undefined || marksDetected > 0 || status === "uncertain") && <button className="text-action" onClick={() => setEditing(true)}>{status === "uncertain" ? "Review or correct marks" : "Correct detected marks"}</button>}</div>
    {editing ? <><div className="teacher-marks-fields">{questions.map((question) => <label key={question.question_number}>Q{question.question_number}<span><input aria-label={`Teacher-awarded marks for question ${question.question_number}`} type="number" min="0" max={question.max_marks} step="0.5" placeholder="—" value={values[question.question_number] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [question.question_number]: event.target.value }))}/><small>/ {question.max_marks}</small></span></label>)}</div><div className="teacher-marks-actions"><span>Only enter a score if the mark on the page could not be read correctly.</span><div><button className="text-action" onClick={() => { setValues(Object.fromEntries(savedMarks.map((item) => [item.question_number, String(item.awarded_marks)]))); setError(""); setEditing(false); }}>Cancel</button><button className="button button-secondary" onClick={submit}>Save corrections <Check size={14}/></button></div></div>{error && <p className="teacher-marks-error">{error}</p>}</>
      : teacherScore !== undefined ? <div className="teacher-marks-comparison"><div><span>TEACHER AWARDED</span><strong>{teacherScore}<small> / {maxMarks}</small></strong></div><span className="comparison-divider"/><div><span>EDUPULSE RUBRIC MATCH</span><strong>{rubricScore}<small> / {maxMarks}</small></strong></div><p>{delta === 0 ? "The totals match. Open a question to compare individual marks and evidence." : delta !== null && delta > 0 ? `Your teacher awarded ${delta} more mark${delta === 1 ? "" : "s"} than EDUPULSE could match to visible rubric evidence. This may reflect partial credit or context the model could not read; only your teacher can explain the award.` : `EDUPULSE matched ${Math.abs(delta ?? 0)} more mark${Math.abs(delta ?? 0) === 1 ? "" : "s"} to the rubric than the teacher awarded. Ask your teacher to clarify any difference.`}{demoMode && <small className="demo-mark-note">Prepared sample corrected-paper scores.</small>}{review.map((item, index) => <small className="teacher-mark-review-note" key={index}>{item.question_number ? `Q${item.question_number}` : item.page ? `Page ${item.page}` : "Score review"} · {item.reason}</small>)}</p></div>
      : marksDetected > 0 ? <div className="teacher-marks-partial"><div><strong>{marksDetected} / {questions.length}</strong><span>question marks read from the uploaded paper</span></div><span>{status === "uncertain" ? "Some written marks need a closer look." : "More readable question scores are needed for a paper total."}</span>{review.map((item, index) => <small key={index}>{item.question_number ? `Q${item.question_number}` : `Page ${item.page ?? "?"}`} · {item.reason}</small>)}</div>
      : <div className="teacher-marks-not-found"><span>{status === "uncertain" ? "Some teacher marks were visible but could not be read confidently." : "No explicit teacher-awarded marks were detected on the uploaded pages."} {status === "uncertain" ? "Check the uncertain score below only if the corrected paper shows one." : "If this is a corrected copy, you can add the marks manually as a fallback."}</span><button className="text-action" onClick={() => setEditing(true)}>Enter missing marks manually</button>{review.map((item, index) => <small key={index}>{item.question_number ? `Q${item.question_number}` : `Page ${item.page ?? "?"}`} · {item.reason}</small>)}</div>}
  </section>;
}

function ResultsPage({ analysis, demoMode, score, expandedQuestion, onExpand, onDiagnosis, onUploadAgain, onSaveTeacherMarks }: { analysis: PaperResult | null; demoMode: boolean; score: number; expandedQuestion: number | null; onExpand: (n: number | null) => void; onDiagnosis: () => void; onUploadAgain: () => void; onSaveTeacherMarks: (marks: TeacherQuestionMark[]) => void }) {
  const results = analysis?.questions?.length ? analysis.questions : SAMPLE_RESULTS;
  const sampleMode = demoMode && score === 31;
  const questionNames = ["Variables & Data Types", "Loops", "Functions", "Recursion", "File Handling"];
  const dynamicConcepts = !sampleMode && analysis?.concepts?.length ? analysis.concepts.map((item) => {
    const criteria = results.flatMap((question) => question.criteria_evaluation).filter((criterion) => criterion.concept?.toLowerCase() === item.concept.toLowerCase());
    const possible = criteria.reduce((sum, criterion) => sum + criterion.max_marks, 0);
    const awarded = criteria.reduce((sum, criterion) => sum + criterion.awarded_marks, 0);
    return { name: item.concept, value: item.mastery_estimate ?? (possible ? Math.round(awarded / possible * 100) : 0), lost: possible - awarded, color: item.mastery_estimate < 45 ? "#ee788c" : item.mastery_estimate < 70 ? "#f0b357" : "#62c4a1" };
  }) : null;
  const conceptData = dynamicConcepts?.length ? dynamicConcepts : [{ name: "Variables", value: 100, lost: 0, color: "#32b58b" }, { name: "Loops", value: 80, lost: 2, color: "#70cdb0" }, { name: "Functions", value: 60, lost: 4, color: "#f0b357" }, { name: "Recursion", value: 33, lost: 10, color: "#ee788c" }, { name: "File Handling", value: 70, lost: 3, color: "#f2a16f" }];
  const losses = sampleMode ? [{ name: "Recursion", value: 10, color: "rose" }, { name: "Functions", value: 4, color: "amber" }, { name: "File Handling", value: 3, color: "peach" }, { name: "Loops", value: 2, color: "blue" }] : conceptData.filter((item) => item.lost > 0).map((item) => ({ name: item.name, value: item.lost, color: item.value < 45 ? "rose" : "amber" })).sort((a, b) => b.value - a.value).slice(0, 4);
  const maxMarks = analysis?.paper_max_marks || 50;
  const marksRecoverable = results.reduce((sum, question) => sum + Math.max(0, question.max_marks - question.question_score), 0);
  const teacherScore = analysis?.teacher_paper_score;
  const displayedScore = teacherScore ?? score;
  const displayedPercent = Math.round(displayedScore / maxMarks * 100);
  return <div className="page-wrap results-wrap">
    <div className="results-topline"><div><div className="eyebrow-tag"><span className="sparkle-dot">✦</span> PAPER ANALYSIS <span className="tag-divider">/</span> PYTHON UNIT TEST</div><h1 className="page-title results-title">Your work, <span>decoded.</span></h1><p className="page-subtitle">A question-by-question review based on your teacher’s marking scheme.</p></div><div className={`analysis-source ${sampleMode ? "sample-source" : ""}`}><span className="source-dot" />{sampleMode ? "DEMO EVALUATION" : "LOCAL AI EVALUATION"}</div></div>
    {!analysis?.finalized && analysis && <div className="provisional-banner"><CircleHelp size={17} /><span>Some answers need teacher review. The subtotal below is provisional until question mapping is confirmed.</span></div>}
    <TeacherMarksPanel questions={results} savedMarks={analysis?.teacher_awarded_marks ?? []} teacherScore={teacherScore} rubricScore={score} maxMarks={maxMarks} status={analysis?.teacher_marks_status} review={analysis?.teacher_marks_review ?? []} demoMode={sampleMode} onSave={onSaveTeacherMarks} />
    <div className="result-hero-grid">
      <section className="score-card"><div className="score-card-head"><div><span className="score-overline">{teacherScore === undefined ? "EDUPULSE RUBRIC ESTIMATE" : "TEACHER-AWARDED SCORE"}</span><h2>Python Unit Test</h2></div><div className="score-star">✦</div></div><div className="score-main"><div className="score-number">{displayedScore}<span> / {maxMarks}</span></div><div className="score-percent"><div className="score-percent-ring" style={{ "--score": `${displayedPercent * 3.6}deg` } as CSSProperties}><div>{displayedPercent}<small>%</small></div></div><span>{teacherScore === undefined ? "rubric" : "official"}</span></div></div><div className="score-bottom"><span><span className="score-mint-dot" /> {teacherScore === undefined ? `${score} marks supported by rubric evidence` : `EDUPULSE rubric review: ${score}/${maxMarks}`}</span><span>{analysis?.teacher_review_recommended ? "Teacher review suggested" : teacherScore === undefined ? "Not an official grade" : "Teacher's recorded score"}</span></div><div className="score-scribble">{displayedScore} <span>✳</span></div></section>
      <section className="concept-card"><div className="card-heading-row"><div><div className="panel-kicker">AT A GLANCE</div><h2>Concept performance</h2></div><span className="signal-pill"><span /> learning signal</span></div><div className="concept-bars">{conceptData.map((item) => <div className="concept-bar-row" key={item.name}><span className={`concept-name ${item.name === "Recursion" ? "weak-name" : ""}`}>{item.name}</span><div className="bar-track"><span className="bar-fill" style={{ width: `${item.value}%`, backgroundColor: item.color }} /></div><strong>{item.value}%</strong></div>)}</div><div className="concept-card-footer"><span><span className="tiny-legend" /> Looks strong</span><span><span className="tiny-legend legend-low" /> Needs a look</span><button onClick={onDiagnosis}>See learning signal <ArrowRight size={14} /></button></div></section>
    </div>
    <div className="analysis-lower-grid">
      <section className="loss-card"><div className="card-heading-row"><div><div className="panel-kicker">MARKS YOU COULD RECOVER</div><h2>Where did your marks go?</h2><p>Each deduction below comes from a missed or partial rubric criterion.</p></div><span className="loss-total">−{marksRecoverable} <small>marks</small></span></div><div className="loss-list">{losses.map((item, index) => <div className={`loss-row ${index === 0 ? "loss-primary" : ""}`} key={item.name}><span className={`loss-icon loss-${item.color}`}>{index === 0 ? <ArrowDownRight size={16} /> : <span>−</span>}</span><span className="loss-label">{item.name}{index === 0 && <small>biggest opportunity</small>}</span><div className="loss-track"><span style={{ width: `${item.value * 9}%` }} /></div><b>−{item.value}</b></div>)}</div><button className="recovery-link" onClick={onDiagnosis}><span className="recovery-icon"><Sparkles size={16} /></span><span><b>Start with recursion</b><small>5-minute targeted recovery</small></span><ArrowRight size={17} /></button></section>
    </div>
    <section className="question-section"><div className="question-section-head"><div><div className="panel-kicker">QUESTION-BY-QUESTION</div><h2>See exactly how it was marked.</h2></div><button className="quiet-button" onClick={onUploadAgain}><RotateCcw size={14} /> Upload another paper</button></div><div className="question-list">{results.map((question) => {
      const info = SAMPLE_RUBRIC.find((item) => item.question_number === question.question_number);
      const name = info?.question_text ?? questionNames[question.question_number - 1] ?? "Question";
      const gaps = question.criteria_evaluation.filter((item) => item.awarded_marks < item.max_marks);
      const teacherQuestionMark = analysis?.teacher_awarded_marks?.find((item) => item.question_number === question.question_number);
      const open = expandedQuestion === question.question_number;
      return <article className={`question-card ${open ? "question-open" : ""} ${question.question_number === 4 ? "question-featured" : ""}`} key={question.question_number}>
        <button className="question-summary" onClick={() => onExpand(open ? null : question.question_number)} aria-expanded={open}><span className={`question-index ${question.question_number === 4 ? "question-index-weak" : ""}`}>Q{question.question_number}</span><span className="question-summary-name"><b>{question.question_text || name}</b><small>{question.max_marks - question.question_score > 0 ? `${question.max_marks - question.question_score} rubric marks not yet evidenced` : "Full rubric marks · all criteria met"}</small>{teacherQuestionMark && <small className="teacher-question-score">Teacher awarded {teacherQuestionMark.awarded_marks}/{question.max_marks} · EDUPULSE matched {question.question_score}/{question.max_marks}</small>}</span><span className={`question-score-chip ${question.question_score / question.max_marks < .5 ? "score-chip-low" : question.question_score / question.max_marks < .75 ? "score-chip-mid" : "score-chip-high"}`}>{question.question_score} <small>/ {question.max_marks}</small></span><span className="question-progress"><span style={{ width: `${question.question_score / question.max_marks * 100}%` }} /></span><ChevronDown className={open ? "chevron-up" : ""} size={18} /></button>
        {open && <div className="question-detail"><div className="detail-two-col"><div className="detail-good"><div className="detail-label"><span>✓</span> WHAT YOU GOT RIGHT</div><ul>{question.criteria_evaluation.filter((item) => item.awarded_marks > 0).map((item) => <li key={item.criterion_id}><Check size={13} /><span><b>{item.criterion} · {item.awarded_marks}/{item.max_marks}</b><small>{item.explanation}</small><em className="evidence-quote">Evidence: {item.student_evidence}</em></span></li>)}</ul></div><div className="detail-lost"><div className="detail-label"><span>↘</span> WHERE MARKS WERE LOST</div><ul>{gaps.map((item) => <li key={item.criterion_id}><span className="lost-bullet">−</span><span><b>{item.criterion} · {item.awarded_marks}/{item.max_marks}</b><small>Why: {item.explanation}</small><em className="evidence-quote">Your answer: {item.student_evidence}</em><em className="evidence-quote">Rubric expected: {item.expected.join(" · ")}</em><b className="recoverable-criterion">{item.max_marks - item.awarded_marks} marks available here</b>{item.teacher_review_recommended && <em className="review-flag">Teacher review recommended · {Math.round(item.confidence * 100)}% confidence</em>}</span></li>)}</ul>{gaps.length === 0 && <p className="no-marks-lost">Every criterion on this question received full marks.</p>}</div></div>{demoMode && question.question_number === 4 && <div className="submitted-answer-evidence"><span>STUDENT ANSWER · EXCERPT</span><code>def fact(n): return n * fact(n - 1)</code><small>This excerpt contains the recursive call but no conditional base-case branch.</small></div>}<div className="rubric-breakdown"><div className="breakdown-head"><span>RUBRIC BREAKDOWN</span><b>{question.question_score} / {question.max_marks}</b></div>{question.criteria_evaluation.map((item) => <div className="breakdown-row" key={item.criterion_id}><span>{item.criterion}</span><div className="mini-track"><span style={{ width: `${item.awarded_marks / item.max_marks * 100}%` }} /></div><b className={item.awarded_marks === item.max_marks ? "full-marks" : item.awarded_marks === 0 ? "zero-marks" : "partial-marks"}>{item.awarded_marks} / {item.max_marks}</b></div>)}</div>{gaps.length > 0 && <div className="question-feedback"><div className="feedback-star"><Lightbulb size={15} /></div><div><b>HOW TO RECOVER THESE MARKS</b><p>For <strong>{gaps[0].criterion}</strong>, include: {gaps[0].expected.join("; ")}. {gaps[0].explanation}</p><span className="confidence-note"><LockKeyhole size={12} /> Improvement guidance follows the approved rubric for this question</span></div></div>}</div>}
      </article>;
    })}</div><div className="question-list-footer"><span><LockKeyhole size={13} /> AI-assisted, teacher-reviewable evaluation</span><span>Scores follow the approved rubric</span></div></section>
    <div className="result-bottom-cta"><div className="cta-sparkle"><Sparkles size={20} /></div><div><b>Ready to turn a gap into a strength?</b><span>Practice the exact concept behind your lost marks.</span></div><button className="button button-primary" onClick={onDiagnosis}>See my learning signal <ArrowRight size={16} /></button></div>
  </div>;
}

function PracticePage({ ready, busy, onStart, onAnalysis, onUpload }: { ready: boolean; busy: boolean; onStart: () => void; onAnalysis: () => void; onUpload: () => void }) {
  return <div className="page-wrap practice-overview-page">
    <div className="page-toolbar"><span className="back-link-static"><span className="status-dot"/> PERSONALIZED PRACTICE</span><span className="quiz-mode-pill"><Target size={13}/> BUILT FROM YOUR ANSWERS</span></div>
    <div className="practice-overview-heading"><span className="practice-focus-icon"><Target size={24}/></span><div><div className="eyebrow-tag">YOUR FOCUS <span className="tag-divider">/</span> RECURSION</div><h1 className="page-title">Let’s make recursion <span>click.</span></h1><p className="page-subtitle">Your answer showed that the recursive call makes sense. The stopping condition needs more practice.</p></div></div>
    <div className="practice-overview-grid"><section className="panel practice-focus-card"><span className="panel-kicker">START WITH THIS</span><h2>Build a reliable base case</h2><p>Without a stopping condition, a recursive function keeps calling itself. Practice spotting the stop, tracing returned values, and finding termination bugs.</p><div className="practice-mistake-line"><span>FROM YOUR PAPER</span><b>Q4 · Base case <strong>0 / 3</strong></b><button className="text-action" onClick={onAnalysis}>See the evidence <ArrowRight size={14}/></button></div></section><aside className="panel practice-session-card"><span className="panel-kicker">A SHORT, FOCUSED SET</span><div className="practice-session-number">5 <small>questions</small></div><p>Led by recursion, with quick checks for functions and file handling.</p><button className="button button-primary" onClick={ready ? onStart : onUpload} disabled={busy}>{busy ? "Preparing questions…" : ready ? "Start practice" : "Upload a paper first"}<ArrowRight size={16}/></button><span className="practice-session-note">About 5 minutes · practice, not a grade</span></aside></div>
    <section className="practice-next-concepts"><div><span className="panel-kicker">AFTER YOUR MAIN FOCUS</span><h2>Then revisit these</h2></div><div className="practice-secondary"><b>Functions</b><span>60% performance · return values and scope</span><i>−4 marks</i></div><div className="practice-secondary"><b>File Handling</b><span>70% performance · errors and iteration</span><i>−3 marks</i></div></section>
  </div>;
}

function DiagnosisPage({ plan, planBusy, busy, onQuiz }: { plan: LearningPlan | null; planBusy: boolean; busy: boolean; onQuiz: () => void }) {
  return <div className="page-wrap diagnosis-page">
    <div className="page-toolbar"><span className="back-link-static"><span className="status-dot" /> PERSONALIZED LEARNING PLAN</span><span className="signal-pill"><span /> based on your rubric evidence</span></div>
    <div className="diagnosis-heading"><div><div className="eyebrow-tag">YOUR LEARNING SIGNAL <span className="tag-divider">/</span> PYTHON UNIT TEST</div><h1 className="page-title">A small gap.<br /><span>A clear next step.</span></h1><p className="page-subtitle">{plan?.misunderstanding || "Your performance suggests difficulty with how recursive functions stop and return."}</p></div><div className="learning-ring-wrap"><div className="learning-ring"><div><strong>33<small>%</small></strong><span>performance<br />estimate</span></div></div><div className="ring-orbit-dot" /><span>RECursion<br /><b>learning signal</b></span></div></div>
    <div className="diagnosis-grid">
      <section className="panel diagnosis-main"><div className="diagnosis-main-head"><span className="weak-concept-icon"><Target size={20} /></span><div><span className="panel-kicker">PRIMARY FOCUS</span><h2>Recursion</h2></div><span className="focus-badge">START HERE <ArrowDownRight size={13} /></span></div><div className="diagnosis-callout"><div className="quote-mark">“</div><div><b>What your answer tells us</b><p>{plan?.short_explanation || "You wrote the recursive call correctly, but your factorial function didn’t show a base case. Without a stopping condition, the calls keep going."}</p><span>Evidence from Q4 <span>·</span> criterion-level review</span></div></div><div className="subconcept-list"><div className="subconcept-head"><b>Sub-concepts to strengthen</b><span>from Q4 rubric</span></div><Subconcept name="Base cases" value={20} tint="pink" hint="Start here" /><Subconcept name="Recursive tracing" value={45} tint="amber" hint="Build next" /><Subconcept name="Termination conditions" value={35} tint="lilac" hint="Then practice" /></div>{planBusy && <div className="plan-loading"><span className="tiny-loader" /> Local AI is tailoring the learning plan from Q4 evidence…</div>}</section>
      <aside className="recovery-plan-card"><div className="plan-decoration"><div className="plan-flower">✿</div><div className="plan-sun" /><div className="plan-orbit">✦</div></div><div className="panel-kicker">YOUR 5-MINUTE RECOVERY</div><h2>{plan?.key_ideas?.[0] || "Build the stopping point first."}</h2><p>{plan?.misunderstanding || "One focused practice set, made from the exact pattern in your answer."}</p><div className="plan-steps"><div><span>01</span><b>{plan?.key_ideas?.[0] || "Spot the base case"}</b><Check size={14} /></div><div><span>02</span><b>{plan?.key_ideas?.[1] || "Trace calls & returns"}</b><span className="step-clock">2 min</span></div><div><span>03</span><b>{plan?.next_step || "Try a fresh re-test"}</b><span className="step-clock">3 min</span></div></div><button className="button button-light" onClick={onQuiz} disabled={busy}>{busy ? <><span className="button-spinner dark-spinner" /> Creating targeted quiz</> : <>Start targeted practice <ArrowRight size={16} /></>}</button><span className="plan-footnote"><Sparkles size={12} /> Five questions · recursion, functions & file handling</span></aside>
    </div>
    <div className="secondary-focus-row"><div className="secondary-title"><span className="panel-kicker">ALSO WORTH A LOOK</span><b>Secondary focus areas</b></div><div className="secondary-concept"><span className="secondary-dot dot-amber" /><div><b>Functions</b><small>60% performance · return values & scope</small></div><span className="secondary-loss">−4 marks</span></div><div className="secondary-concept"><span className="secondary-dot dot-peach" /><div><b>File Handling</b><small>70% performance · errors & iteration</small></div><span className="secondary-loss">−3 marks</span></div></div>
    <div className="diagnosis-disclaimer"><Lightbulb size={15} /><span>A learning signal is an estimate from this assessment, not a measure of your ability. One focused re-test can show what changed.</span></div>
  </div>;
}

function Subconcept({ name, value, tint, hint }: { name: string; value: number; tint: string; hint: string }) {
  return <div className="subconcept-row"><span className={`subconcept-icon ${tint}`}><span /></span><div className="subconcept-copy"><b>{name}</b><div className="subconcept-track"><span style={{ width: `${value}%` }} /></div></div><span className="subconcept-value">{value}%</span><small className={`subconcept-hint ${tint}`}>{hint}</small></div>;
}

function QuizPage({ questions, answers, setAnswers, onSubmit, onSample, allowSample, busy, onBack, title, subtitle, error }: { questions: QuizItem[]; answers: number[]; setAnswers: (answers: number[]) => void; onSubmit: () => void; onSample: () => void; allowSample: boolean; busy: boolean; onBack: () => void; title: string; subtitle: string; error: string }) {
  const [active, setActive] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const mixedConcepts = new Set(questions.map((question) => question.concept).filter(Boolean)).size > 1;
  const hint = questions[active].concept === "Functions" ? "Trace the value returned by the function, not just what it prints." : questions[active].concept === "File Handling" ? "Look for a context manager that closes the file even if an error occurs." : "Look for the condition that reduces the problem to a simpler input.";
  const setAnswer = (question: number, option: number) => setAnswers(answers.map((value, index) => index === question ? option : value));
  return <div className="page-wrap quiz-page">
    <div className="page-toolbar"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back</button><span className="quiz-mode-pill"><Sparkles size={13} /> TARGETED PRACTICE</span></div>
    <div className="quiz-headline"><div><div className="eyebrow-tag">{mixedConcepts ? "RECURSION · FUNCTIONS · FILES" : "RECURSION"} <span className="tag-divider">/</span> {title}</div><h1 className="page-title">{title === "Recursion recovery" ? <>Practice with <span>purpose.</span></> : <>Try a <span>fresh approach.</span></>}</h1><p className="page-subtitle">{subtitle}</p></div><div className="quiz-stats"><span><Clock3 size={15} /> About 5 min</span><span><Zap size={15} /> {questions.length} questions</span></div></div>
    <div className="quiz-layout"><aside className="quiz-progress-card"><div className="quiz-progress-top"><span className="panel-kicker">YOUR PROGRESS</span><b>{answers.filter((answer) => answer >= 0).length}<small> / {questions.length}</small></b></div><div className="quiz-progress-dots">{questions.map((_, index) => <button key={index} className={`${index === active ? "current" : ""} ${answers[index] >= 0 ? "answered" : ""}`} onClick={() => setActive(index)}>{answers[index] >= 0 ? <Check size={13} /> : index + 1}</button>)}</div><div className="quiz-focus-box"><Target size={17} /><div><b>Focus area</b><span>{questions[active].concept ?? "Recursion"}<br />{questions[active].sub ?? "Base cases"}</span></div></div><div className="quiz-streak"><span>✦</span><div><b>Small steps add up.</b><small>Every question builds on the last.</small></div></div></aside>
      <section className="quiz-question-card"><div className="quiz-q-top"><span className="question-type-tag">{questions[active].kind}</span><span className="question-topic-tag">{questions[active].concept ?? "Recursion"} · {questions[active].sub ?? "Practice"}</span><span className="quiz-q-counter">QUESTION {String(active + 1).padStart(2, "0")} <span>/ {String(questions.length).padStart(2, "0")}</span></span></div><h2>{questions[active].prompt}</h2><div className="option-list">{questions[active].options.map((option, index) => <button key={option} className={`quiz-option ${answers[active] === index ? "selected" : ""}`} onClick={() => setAnswer(active, index)}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span>{answers[active] === index && <CheckCircle2 size={18} />}</button>)}</div>{showHint && <div className="quiz-hint"><Lightbulb size={15} /> {hint}</div>}<div className="quiz-question-footer"><button className="hint-button" onClick={() => setShowHint(!showHint)}><Lightbulb size={15} /> {showHint ? "Hide hint" : "Need a hint?"}</button><div className="quiz-nav-buttons"><button className="quiz-prev" onClick={() => setActive(Math.max(0, active - 1))} disabled={active === 0}><ArrowLeft size={15} /> Previous</button>{active < questions.length - 1 ? <button className="button button-primary" onClick={() => setActive(active + 1)}>Next question <ArrowRight size={15} /></button> : <button className="button button-primary" onClick={onSubmit} disabled={busy}>{busy ? "Scoring…" : <>Finish practice <Check size={16} /></>}</button>}</div></div>{error && <p className="quiz-error">{error}</p>}{allowSample && <button className="sample-answer-link quiz-sample-link" onClick={onSample}><Sparkles size={14}/> Use prepared demo answers · 4/5</button>}</section></div>
  </div>;
}

function QuizResultPage({ score, gap, review, onRetest, onBack }: { score: number; gap: string; review: QuizReviewItem[]; onRetest: () => void; onBack: () => void }) {
  const missed = review.filter((item) => !item.correct);
  return <div className="page-wrap completion-page"><div className="page-toolbar"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to analysis</button><span className="quiz-mode-pill"><CheckCircle2 size={13} /> PRACTICE COMPLETE</span></div><div className="completion-card practice-completion"><div className="completion-confetti confetti-a">✳</div><div className="completion-confetti confetti-b">✦</div><div className="completion-icon practice-icon"><Zap size={22} /></div><div className="eyebrow-tag centered-tag">TARGETED PRACTICE <span className="tag-divider">/</span> YOUR ANSWER REVIEW</div><h1 className="page-title">Nice work. <span>Keep going.</span></h1><p className="page-subtitle">Here’s what each answer showed, including the ones worth another look.</p><div className="practice-score-big"><strong>{score}<small> / {review.length || 5}</small></strong><div><span>{score >= 4 ? "Strong practice signal" : "A useful first attempt"}</span><small>on a new set of questions</small></div></div><div className="practice-feedback"><div className="feedback-star"><Lightbulb size={17} /></div><div><b>{missed.length ? "Your next thing to review" : "All answers correct"}</b><p>{missed.length ? `Start with ${gap}. Read the explanation below, then try applying it in the re-test.` : "You answered each practice question correctly. The re-test checks the same ideas with fresh questions."}</p></div></div><section className="quiz-review-list"><h2>Question-by-question feedback</h2>{review.map((item, index) => <article className={`quiz-review-item ${item.correct ? "review-correct" : "review-incorrect"}`} key={`${index}-${item.question}`}><div className="quiz-review-head"><span className="quiz-review-state">{item.correct ? <CheckCircle2 size={15}/> : <CircleHelp size={15}/>} {item.correct ? "Correct" : "Review this"}</span><span>{item.concept} · {item.sub}</span></div><h3>{index + 1}. {item.question}</h3><p className="quiz-review-choice"><b>Your answer:</b> {item.selectedAnswer}</p>{!item.correct && <p className="quiz-review-choice correct-choice"><b>Correct answer:</b> {item.correctAnswer}</p>}<p className="quiz-review-explanation"><b>Why:</b> {item.explanation}</p></article>)}</section><div className="completion-actions"><button className="button button-secondary" onClick={onBack}><ArrowLeft size={15} /> Review paper analysis</button><button className="button button-primary" onClick={onRetest}>Take a fresh re-test <ArrowRight size={16} /></button></div><div className="completion-foot"><LockKeyhole size={13} /> The re-test uses different questions from your exam.</div></div></div>;
}

function RetestResultPage({ score, practiceScore, onResources, onDashboard }: { score: number; practiceScore: number; onResources: () => void; onDashboard: () => void }) {
  const improved = score > 5;
  return <div className="page-wrap completion-page retest-page"><div className="page-toolbar"><span className="back-link-static"><CheckCircle2 size={15} /> RE-TEST COMPLETE</span><span className="quiz-mode-pill"><Target size={13} /> LEARNING SIGNAL</span></div><div className="completion-card retest-completion"><div className="completion-confetti confetti-a">✳</div><div className="completion-confetti confetti-b">✦</div><div className="completion-icon retest-icon"><Trophy size={23} /></div><div className="eyebrow-tag centered-tag">RECURSION <span className="tag-divider">/</span> PERFORMANCE CHECK-IN</div><h1 className="page-title">Look how far <span>you’ve come.</span></h1><p className="page-subtitle">You applied the idea in fresh questions — that’s the part that matters.</p><div className="progress-compare"><div className="compare-metric compare-before"><span>INITIAL</span><strong>5<small> / 15</small></strong><small>Q4 recursion</small></div><div className="compare-arrow"><span /><ArrowRight size={18} /></div><div className="compare-metric compare-practice"><span>PRACTICE</span><strong>{practiceScore}<small> / 5</small></strong><small>targeted questions</small></div><div className="compare-arrow"><span /><ArrowRight size={18} /></div><div className="compare-metric compare-after"><span>RE-TEST</span><strong>{score}<small> / 15</small></strong><small>new questions</small></div></div><div className="improved-message"><span className="improved-icon"><ArrowDownRight size={18} /></span><div><b>{improved ? "Your performance signal improved after targeted practice." : "Your performance signal is still developing."}</b><span>{improved ? "Base cases and call tracing are showing up more consistently." : "A second focused practice round can help the steps stick."} This is progress, not a claim of complete mastery.</span></div><span className="improved-delta">+{score - 5}<small> pts</small></span></div><div className="subconcept-after"><span>BASE CASES</span><div><i style={{ width: "80%" }} /></div><b>80%</b><small>was 20%</small><span>RECURSIVE TRACING</span><div><i style={{ width: "75%" }} /></div><b>75%</b><small>was 45%</small></div><div className="completion-actions"><button className="button button-secondary" onClick={onDashboard}>Back to paper analysis</button><button className="button button-primary" onClick={onResources}>See learning resources <ArrowRight size={16} /></button></div></div><div className="completion-foot standalone-foot"><LockKeyhole size={13} /> One short re-test is a signal of improvement — not a measure of complete mastery.</div></div>;
}

function ResourcesPage({ resources, concept, live, loading, onConcept, onBack, onQuiz }: { resources: Resource[]; concept: string; live: boolean; loading: boolean; onConcept: (concept: string) => void; onBack: () => void; onQuiz: () => void }) {
  const [selectedVideo, setSelectedVideo] = useState<Resource | null>(resources[0] ?? null);
  useEffect(() => { setSelectedVideo(resources[0] ?? null); }, [resources]);
  const videoId = (resource: Resource | null) => {
    if (!resource) return null;
    if (resource.videoId) return resource.videoId;
    try {
      const url = new URL(resource.url);
      return url.hostname.includes("youtu.be") ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.match(/\/embed\/([^/]+)/)?.[1] ?? null;
    } catch { return null; }
  };
  const selectedId = videoId(selectedVideo);
  return <div className="page-wrap resources-page">
    <div className="page-toolbar"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back</button><span className="approved-chip"><BookOpen size={14} /> CURATED FOR YOUR GAP</span></div>
    <div className="resources-heading"><div><div className="eyebrow-tag">NEXT UP <span className="tag-divider">/</span> RECOMMENDED RESOURCES</div><h1 className="page-title">A little more <span>clarity.</span></h1><p className="page-subtitle">Your top recommended lesson is ready to play. Choose another video or switch focus.</p></div><div className="resource-spark-card"><Sparkles size={19} /><span>Made for your<br /><b>learning signal</b></span></div></div>
    <div className="resource-focus-strip"><span className="resource-focus-icon"><Target size={17} /></span><div><span>YOUR FOCUS</span><b>{concept} <span>→</span> {concept === "Recursion" ? "Base cases" : concept === "Functions" ? "Return values & scope" : "Safe file access"}</b></div><span className="resource-focus-tag">{loading ? "Finding the best lesson…" : live ? "Ranked YouTube recommendations" : "Curated lesson"}</span></div>
    <div className="resource-topic-tabs">{["Recursion", "Functions", "File Handling"].map((topic) => <button key={topic} className={concept === topic ? "active" : ""} onClick={() => onConcept(topic)}>{topic}</button>)}</div>
    <section className="resource-feature-player" aria-label="Recommended video player">
      <div className="resource-player-frame">{loading ? <div className="resource-player-loading"><span className="tiny-loader"/><b>Finding the best match for {concept}…</b></div> : selectedId ? <iframe key={selectedId} src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selectedId)}?autoplay=1&mute=1&playsinline=1&rel=0`} title={selectedVideo?.title ?? `Recommended ${concept} lesson`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <div className="resource-player-loading"><Play size={25}/><b>Choose a video below to start learning.</b></div>}</div>
      <div className="resource-player-caption"><div><span className="panel-kicker">{loading ? "PREPARING YOUR LESSON" : "NOW PLAYING · TOP MATCH"}</span><h2>{loading ? `Finding a ${concept} lesson…` : selectedVideo?.title ?? "Recommended lesson"}</h2><p>{selectedVideo ? `${selectedVideo.channel} · ${selectedVideo.duration} · ${selectedVideo.description}` : "Videos are optional. Your learning plan and practice are ready."}</p></div>{selectedVideo && <a className="resource-open" href={selectedVideo.url} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={13}/></a>}</div>
    </section>
    <div className="resource-grid">{resources.slice(0, 3).map((resource, index) => <button type="button" className={`resource-card ${selectedVideo?.title === resource.title ? "resource-card-selected" : ""}`} key={`${resource.title}-${resource.channel}`} onClick={() => setSelectedVideo(resource)} aria-pressed={selectedVideo?.title === resource.title}>
      <div className={`resource-art ${resource.color}`}>{resource.thumbnail && <img className="resource-thumbnail" src={resource.thumbnail} alt="" loading="lazy" />}<div className="resource-play"><Play size={17} fill="currentColor" /></div><span className="resource-number">0{index + 1}</span><span className="resource-art-label">{concept.toUpperCase()}<br /><b>{index === 0 ? "TOP MATCH" : index === 1 ? "ANOTHER VIEW" : "GO DEEPER"}</b></span><span className="resource-duration"><Clock3 size={12} /> {resource.duration}</span><span className="resource-art-orbit">✦</span></div>
      <span className="resource-card-body"><span className="resource-channel">{resource.channel}</span><strong>{resource.title}</strong><span className="resource-card-description">{resource.description}</span><span className="resource-open">{selectedVideo?.title === resource.title ? "Playing above" : "Play in EDUPULSE"} <Play size={12} fill="currentColor" /></span></span>
    </button>)}</div>
    <div className="resources-bottom"><div><div className="resource-small-illustration">✳</div><span><b>Keep the momentum.</b><small>Try another fresh question while this is top of mind.</small></span></div><button className="button button-primary" onClick={onQuiz}>Practice again <RotateCcw size={15} /></button></div><div className="resources-source-note"><Lightbulb size={14} /> Videos play here. Your explanation and practice set are ready even when YouTube is unavailable.</div>
  </div>;
}
