import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AboutPage } from "@/pages/About";
import { AskPage } from "@/pages/Ask";
import { TodayPage } from "@/pages/Today";
import { WhyPage } from "@/pages/Why";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AskPage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="why" element={<WhyPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
