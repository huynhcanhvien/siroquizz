"use client";
import {StudyPage} from "@/features/study/components/StudyPage";
import {LearnMode} from "@/features/learn/components/LearnMode";
export default function LearnPage(){return <StudyPage mode="learn">{set=><LearnMode set={set}/>}</StudyPage>;}
