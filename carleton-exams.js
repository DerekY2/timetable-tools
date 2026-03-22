/**
 * SPDX-FileCopyrightText: Copyright (c) 2026, Derek Yu. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Carleton University Timetable Processor
 *
 * This script processes Carleton University student exam schedules
 * and exports them as iCal
 */
chrome.storage.local.get(['carleton-exams', 'privacy_policy_agreement'], (results) => {
    const config = results['carleton-exams'];
    const pa = results['privacy_policy_agreement'];
    const exportCombined = config ? config[0] : true;

    const examLink = 'a[href="pkg_exam_class_list.p_parm_form"]';
    const submitBtn = document.querySelector('input[type=submit][value="CONTINUE"]');

    if (document.title.trim() == 'Sign In') {
    }
    else if (document.title.trim() == 'Sign out') {
        window.location.href = 'https://ssoman.carleton.ca/ssomanager/c/SSB?pkg=bwskfshd.P_CrseSchd'
    }
    else if (document.title.trim() == 'Main Menu') {
        waitForElm(examLink).then((link) => {
            link.click()
        })
    }
    else if (submitBtn) {
        submitBtn.click()
    }
    else if (document.title.trim().toLowerCase().includes('exam schedule')) {
        chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempLoginCU' })
        waitForElm('.pagebodydiv').then(() => {
            run()
        })
    }
    else {
    }

    function waitForElm(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    function run() {
        if (!pa || !pa[0]) {
            alert("ERROR: Privacy Policy Agreement not found, aborting!\n\n Timetable Tools")
            chrome.runtime.sendMessage({ action: 'end-timetable-request' })
            chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
            return;
        }

        // Find the exam table — the one with <th> headers containing "Course"
        const tables = document.querySelectorAll('table[border="0"][cellspacing="7"]');
        let examTable = null;
        tables.forEach((t) => {
            const headers = t.querySelectorAll('th');
            headers.forEach((h) => {
                if (h.textContent.trim() === 'Course') examTable = t;
            });
        });

        if (!examTable) {
            alert('Exam schedule table not found!\n\nTimetable Tools');
            chrome.runtime.sendMessage({ action: 'end-timetable-request' })
            chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
            return;
        }

        const rows = examTable.querySelectorAll('tr');
        if (rows.length < 2) {
            alert('No exams found in the schedule.\n\nTimetable Tools');
            chrome.runtime.sendMessage({ action: 'end-timetable-request' })
            chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
            return;
        }

        const monthMap = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
            'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
            'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };

        function parseDate(dateStr, timeStr) {
            // dateStr: "APR-15-2026", timeStr: "09:00"
            const parts = dateStr.split('-');
            const month = monthMap[parts[0]];
            const day = parts[1];
            const year = parts[2];
            const [hours, minutes] = timeStr.split(':');
            return `${year}${month}${day}T${hours}${minutes}00`;
        }

        const staticHeadersDiv = document.querySelector('.staticheaders');
        const userInfo2 = staticHeadersDiv ? staticHeadersDiv.innerHTML.split('<br>')[1].trim().split(' ').slice(0, 2).join(' ') : 'Exams';

        // Read headers from first row
        const headerCells = rows[0].querySelectorAll('th');
        const headers = [];
        headerCells.forEach((h) => {
            headers.push(h.textContent.trim());
        });

        const exams = [];
        // Skip header row (index 0)
        for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < headers.length) continue;

            // Build header:value map for all columns
            const fields = {};
            headers.forEach((header, idx) => {
                fields[header] = cells[idx].textContent.trim();
            });

            const course = fields['Course'] || '';
            const startDate = fields['Exam Start Date'] || '';
            const startTime = fields['Exam Start Time'] || '';

            if (!course || !startDate || !startTime) continue;

            exams.push(fields);
        }

        if (exams.length === 0) {
            alert('No exams found to export.\n\nTimetable Tools');
            chrome.runtime.sendMessage({ action: 'end-timetable-request' })
            chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
            return;
        }

        function mapTerm(regTerm) {
            const termCode = regTerm.slice(-2);
            const year = regTerm.slice(0, -2);
            const termMap = { '10': 'Winter', '20': 'Summer', '30': 'Fall' };
            const sem = termMap[termCode];
            return sem ? `${sem} ${year}` : regTerm;
        }

        function buildDescription(exam) {
            const sameDay = exam['Exam Start Date'] === exam['Exam End Date'];
            const course = exam['Course'] || '';
            const section = exam['Section'] || '';
            const duration = exam['Exam Duration (mins)'] || '';
            const lines = [];

            lines.push(`Course: ${course}${section ? '-' + section : ''}`);
            lines.push(`Title: ${exam['Title'] || 'N/A'}`);
            if (sameDay) {
                lines.push(`Exam Date: ${exam['Exam Start Date'] || 'N/A'}`);
                lines.push(`Exam Time: ${exam['Exam Start Time'] || ''} - ${exam['Exam End Time'] || ''}`);
            } else {
                lines.push(`Exam Start: ${exam['Exam Start Date'] || ''} ${exam['Exam Start Time'] || ''}`);
                lines.push(`Exam End: ${exam['Exam End Date'] || ''} ${exam['Exam End Time'] || ''}`);
            }
            lines.push(`Exam Duration (mins): ${duration || 'N/A'}`);
            lines.push(`Building/Room: ${exam['Bldg/Rm'] || 'N/A'}`);
            lines.push(`Row(s): ${exam['Row(s)'] || 'N/A'}`);
            lines.push(`Exam Availability: ${exam['Exam Availability'] || 'N/A'}`);
            lines.push(`Exam Type: ${exam['Exam Type'] || 'N/A'}`);
            lines.push(`Alternate Schedule/Type: ${exam['Alternate Schedule/Type'] || 'N/A'}`);
            if (exam['Reg Term']) {
                lines.push(`Term: ${mapTerm(exam['Reg Term'])}`);
            }
            return lines.join('\\n');
        }

        function buildEvent(exam) {
            const dtStart = parseDate(exam['Exam Start Date'], exam['Exam Start Time']);
            const dtEnd = parseDate(exam['Exam End Date'], exam['Exam End Time']);
            const course = exam['Course'] || '';
            const section = exam['Section'] || '';
            const examType = exam['Exam Type'] || '';
            const location = exam['Bldg/Rm'] || '';

            let event = 'BEGIN:VEVENT\n';
            event += `DTSTART;TZID=America/Toronto:${dtStart}\n`;
            event += `DTEND;TZID=America/Toronto:${dtEnd}\n`;
            event += `SUMMARY:${course}-${section} ${examType}\n`;
            event += `DESCRIPTION:${buildDescription(exam)}\n`;
            event += `LOCATION:${location}\n`;
            event += 'END:VEVENT\n';
            return event;
        }

        if (exportCombined) {
            let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TimetableTools//CU_Exams//EN\n';
            exams.forEach((exam) => {
                icsContent += buildEvent(exam);
            });
            icsContent += 'END:VCALENDAR';

            const regTerm = exams[0]['Reg Term'] || '';
            const termLabel = regTerm ? mapTerm(regTerm) : userInfo2;

            const blob = new Blob([icsContent], { type: 'text/calendar' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = termLabel + ' Exams.ics';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        else {
            let count = 0;
            exams.forEach((exam) => {
                let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TimetableTools//CU_Exams//EN\n';
                icsContent += buildEvent(exam);
                icsContent += 'END:VCALENDAR';

                const course = exam['Course'] || '';
                const section = exam['Section'] || '';

                const blob = new Blob([icsContent], { type: 'text/calendar' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${course}-${section} Exam.ics`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                count++;
            });
            if (count <= 0) {
                alert('No exams found\n\nTimetable Tools')
            }
        }

        console.log(`Downloaded ${exams.length} exam(s) as .ics file(s).`);
        chrome.runtime.sendMessage({ action: 'end-timetable-request' })
        chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
    }
})