@echo off
cd /d "C:\Users\yinwe\WorkBuddy\2026-05-06-task-1\seedhub-monitor"
node scrape.js >> logs\%%DATE:~0,4%%%%DATE:~5,2%%%%DATE:~8,2%%.log 2>&1
