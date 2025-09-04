/**
 * SPDX-FileCopyrightText: Copyright (c) 2025, Derek Yu. All rights reserved.
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
 * This script processes Carleton University student timetables
 * and converts them to iCal format
 */
chrome.storage.local.get(['carleton', "privacy_policy_agreement"], (results) => {
    let r;
    let pa;
    if (!results) {
        r = getDefaultTerm()
        alert("No default term found;\Using:", r)
    } else {
        r = results['carleton']
        pa = results['privacy_policy_agreement']
    }
    const termSelector = document.getElementById('term_id')
    const BIG_FAT_HEADER = 'body > div.pagetitlediv > table > tbody > tr:nth-child(1) > td:nth-child(1) > h2'
    const timetableNav = 'body > div.footerlinksdiv > span > map > p:nth-child(2) > a:nth-child(2)'
    const calendarNav = 'body > div.pagebodydiv > table.menuplaintable > tbody > tr:nth-child(3) > td:nth-child(2) > span > ul > li:nth-child(1) > a:nth-child(4)'
    const targetTerm = r[1] + r[0]
    const exportCombined = r[2]
    const submitBtn = document.querySelector('input[type=submit]')
    if (document.title.trim() == 'Sign In') {
    }
    else if (document.title.trim() == 'Sign out') {
        window.location.href = 'https://ssoman.carleton.ca/ssomanager/c/SSB?pkg=bwskfshd.P_CrseSchd'
    }
    else if (document.title.trim() == 'Main Menu') {
        waitForElmText(calendarNav, 'Student Timetable').then(
            document.querySelector(calendarNav).click()
        )
    }
    else if (document.title.trim() == 'Student Timetable') {
        waitForElmText(timetableNav, 'Detail Schedule').then(
            document.querySelector(timetableNav).click()
        )
    }
    else if (document.title.trim() == 'Registration Term') {
        waitForElm('#term_id').then(() => {
            //console.log('termSelector found')
            if (isValidTerm(termSelector, targetTerm)) {
                termSelector.value = targetTerm;
                submitBtn.click();
            } else {
                alert(`Request failed: Term [${mapTerm(r)}] Not Found\n\nNeuroNest`)
                chrome.runtime.sendMessage({ action: 'end-timetable-request' })
                chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
            }
        })
    }
    else if (document.title.trim() == 'Student Detail Schedule') {
        chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempLoginCU' })
        waitForElm(BIG_FAT_HEADER).then((elm) => {
            //console.log('Timetable Loaded');
            //console.log(elm.textContent);
            run()
        })
    }
    else {
    }

    function waitForElm(selector) {
        return new Promise(resolve => {
            //console.log('waiting for',selector,'...')
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

    function waitForElmText(selector, text, maxWaitTime = 5000) {
        return Promise.race([
            new Promise((resolve, reject) => {
                const observer = new MutationObserver((mutations, observer) => {
                    const element = document.querySelector(selector);
                    if (element && element.textContent.trim() === text) {
                        observer.disconnect();
                        resolve(element);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout waiting for element text')), maxWaitTime)
            )
        ]);
    }

    function isValidTerm(termSelector, targetTerm) {
        const options = termSelector.options;
        for (let i = 0; i < options.length; i++) {
            if (options[i].value == targetTerm) {
                return true;
            }
        }
        return false;
    }

    function run() {
        if (pa[0]) {
            //console.log('running  downloader.')
            const tables = [];
            const log = []
            const staticHeadersDiv = document.querySelector('.staticheaders')
            const userInfo2 = staticHeadersDiv ? staticHeadersDiv.innerHTML.split('<br>')[1].trim().split(' ').slice(0, 2).join(' ') : 'Nameless';
            const userInfo3 = staticHeadersDiv ? staticHeadersDiv.innerHTML.split('<br>')[0].trim().split(' ').slice(1).join(' ') : 'Unknown User';
            document.querySelectorAll('table.datadisplaytable').forEach((table, index) => {
                const section = {};
                const meta = {}
                meta['table-num'] = index
                if (table.querySelector('a')) {
                    //console.log(table.querySelectorAll('tr'))
                    table.querySelectorAll('tr').forEach((r) => {
                        const headerElement = r.querySelector('th');
                        const valueElement = r.querySelector('td');
                        if (headerElement && valueElement) {
                            let header = headerElement.textContent.slice(0, -1).trim();
                            let value = valueElement.textContent.trim();
                            meta[header] = value;
                        }
                    });
                    let courseData = table.querySelector('a').textContent.trim().split(' - ').reverse()
                    let courseCode = courseData[1]
                    let courseSection = courseData[0]
                    let courseName = courseData.slice(2).join(' - ')
                    let crn = getRowContent(table, 3);
                    let instructor = getRowContent(table, 5);
                    //console.log(courseData,'\n',courseCode,'\n',courseSection,'\n',courseName)
                    section.courseName = courseName;
                    section.courseCode = courseCode;
                    section.courseSection = courseSection
                    section.crn = crn
                    section.instructor = instructor.trim() ? instructor.trim() : 'Instructor: N/A'
                    tables[index / 2] = section;
                    log.push(meta)
                } else {

                    const row = table.querySelector('tr:nth-of-type(2)');
                    const cells = row.querySelectorAll('td');
                    section.classStartTime = cells[1].textContent.trim() == 'TBA' ? 'N/A' : cells[1].textContent.trim().split(' - ')[0];
                    section.classEndTime = cells[1].textContent.trim() == 'TBA' ? 'N/A' : cells[1].textContent.trim().split(' - ')[1];
                    //console.log('starttimes:',section.classStartTime, section.classEndTime)
                    section.daysOfTheWeek = cells[2].textContent.trim();
                    section.location = cells[3].textContent.trim() == 'TBA' ? '' : cells[3].textContent.trim();
                    section.startDate = new Date(cells[4].textContent.trim().split(' - ')[0]);
                    section.endDate = new Date(cells[4].textContent.trim().split(' - ')[1]);
                    Object.assign(tables[Math.floor(index / 2)], section);

                    table.querySelectorAll('th').forEach((r, o) => {
                        let header = r.textContent.trim()
                        let value = cells[o].textContent.trim()
                        meta[header] = value
                    })
                    log.push(meta)
                }
            });

            const timetable = tables;
            //console.log('timetable:\n',timetable)
            function getRowContent(table, rowIndex) {
                const row = table.querySelector(`tr:nth-of-type(${rowIndex}) td`);
                return !(row == '') ? row.textContent.trim() : 'N/A';
            }

            function createICal(timetable) {
                //console.log('Creating iCal with timetable:', timetable);

                if (exportCombined) {
                    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//NeuroNest//CU_Timetable//EN\n';
                    let count = 0;
                    let allCourses = '';
                    timetable.forEach(node => {
                        const daysMap = {
                            'M': 'MO',
                            'T': 'TU',
                            'W': 'WE',
                            'R': 'TH',
                            'F': 'FR'
                        };

                        // startDate offset
                        node.startDate = adjustStartDateToDay(new Date(node.startDate), node.daysOfTheWeek);

                        const startTime = node.classStartTime == 'N/A' ? 'none' : convertTo24Hour(node.classStartTime).split(':');
                        const endTime = node.classEndTime == 'N/A' ? 'none' : convertTo24Hour(node.classEndTime).split(':');
                        const startHour = parseInt(startTime[0], 10);
                        const startMinute = parseInt(startTime[1], 10);
                        const endHour = parseInt(endTime[0], 10);
                        const endMinute = parseInt(endTime[1], 10);
                        const timeNoSpace = node.classStartTime.replace(/\s/g, '');
                        const timeNoSpace2 = node.classEndTime.replace(/\s/g, '');
                        let dayList = []
                        node.daysOfTheWeek.split('').forEach(day => {
                            const dayOfWeek = daysMap[day];
                            dayList.push(dayOfWeek)
                        });
                        if (dayList && startTime != 'none') {
                            const courseInfo = `${node.courseCode} - ${node.courseSection}\n${timeNoSpace} - ${timeNoSpace2}\n${node.location ? node.location : 'Location: N/A'}\n${node.courseName}\n${node.instructor}\n${node.crn}\n...\n`;
                            const startDate = new Date(node.startDate);
                            const endDate = new Date(node.startDate); // Use the same start date for DTEND
                            const untilDate = new Date(node.endDate);
                            untilDate.setDate(untilDate.getDate() + 1);
                            startDate.setUTCHours(startHour, startMinute, 0, 0);
                            endDate.setUTCHours(endHour, endMinute, 0, 0);
                            allCourses += courseInfo;
                            icsContent += 'BEGIN:VEVENT\n';
                            icsContent += `DTSTART;TZID=America/Toronto:${formatDateLocal(startDate)}\n`;
                            icsContent += `DTEND;TZID=America/Toronto:${formatDateLocal(endDate)}\n`;
                            icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${dayList.join(',')};UNTIL=${formatDateUTC(untilDate)};WKST=SU;\n`;
                            icsContent += `SUMMARY:${node.courseCode}-${node.courseSection}\n`;
                            icsContent += `DESCRIPTION:${node.courseName}\\n${node.courseCode} - ${node.courseSection}\\n${node.instructor}\\n${node.crn}\\n${timeNoSpace} - ${timeNoSpace2}\\n${node.location ? node.location : 'Location: N/A'}\n`;
                            icsContent += `LOCATION:${node.location}\n`;
                            icsContent += 'END:VEVENT\n';
                            count++
                        }
                    });
                    icsContent += 'END:VCALENDAR';
                    //console.log('iCal content generated:', icsContent);
                    if (count > 0) {
                        const blob = new Blob([icsContent], { type: 'text/calendar' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = userInfo2 + '.ics';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    } else {
                        alert('Nothing to see here...\n\nNeuroNest')
                    }
                    const currentDate = new Date().toLocaleString('en-US', { timeZone: 'America/Toronto', hour12: false });
                    logCalendar([userInfo3, currentDate, 'carleton', userInfo2, allCourses, icsContent]);
                }
                else {
                    let totalCount = 0
                    let totalIcs = '';
                    let allCourses = '';
                    timetable.forEach(node => {
                        let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//NeuroNest//Timetable//EN\n';
                        let count = 0;
                        const daysMap = {
                            'M': 'MO',
                            'T': 'TU',
                            'W': 'WE',
                            'R': 'TH',
                            'F': 'FR'
                        };

                        // startDate offset
                        node.startDate = adjustStartDateToDay(new Date(node.startDate), node.daysOfTheWeek);

                        //console.log('unconverted time: ', node.classStartTime, 'end:', node.classEndTime);
                        const startTime = node.classStartTime == 'N/A' ? 'none' : convertTo24Hour(node.classStartTime).split(':');
                        const endTime = node.classEndTime == 'N/A' ? 'none' : convertTo24Hour(node.classEndTime).split(':');
                        //console.log('converted to 24 hours:', startTime, 'end:', endTime);
                        const startHour = parseInt(startTime[0], 10);
                        const startMinute = parseInt(startTime[1], 10);
                        const endHour = parseInt(endTime[0], 10);
                        const endMinute = parseInt(endTime[1], 10);
                        const timeNoSpace = node.classStartTime.replace(/\s/g, '');
                        const timeNoSpace2 = node.classEndTime.replace(/\s/g, '');
                        let dayList = []
                        node.daysOfTheWeek.split('').forEach(day => {
                            //console.log('day:', day);
                            const dayOfWeek = daysMap[day];
                            dayList.push(dayOfWeek)
                        });
                        if (dayList && startTime != 'none') {
                            const startDate = new Date(node.startDate);
                            const endDate = new Date(node.startDate); // Use the same start date for DTEND
                            const untilDate = new Date(node.endDate);
                            untilDate.setDate(untilDate.getDate() + 1);

                            startDate.setUTCHours(startHour, startMinute, 0, 0);
                            endDate.setUTCHours(endHour, endMinute, 0, 0);
                            const courseInfo = `${node.courseCode} - ${node.courseSection}\n${timeNoSpace} - ${timeNoSpace2}\n${node.location ? node.location : 'Location: N/A'}\n${node.courseName}\n${node.instructor}\n${node.crn}\n...\n`;
                            //console.log(`Creating event for ${node.courseName} on ${dayList}`);
                            //console.log(`Start Date: ${startDate}`);
                            //console.log(`End Date: ${endDate}`);
                            allCourses += courseInfo;
                            icsContent += 'BEGIN:VEVENT\n';
                            icsContent += `DTSTART;TZID=America/Toronto:${formatDateLocal(startDate)}\n`;
                            icsContent += `DTEND;TZID=America/Toronto:${formatDateLocal(endDate)}\n`;
                            icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${dayList.join(',')};UNTIL=${formatDateUTC(untilDate)};WKST=SU;\n`;
                            icsContent += `SUMMARY:${node.courseCode}-${node.courseSection}\n`;
                            icsContent += `DESCRIPTION:${node.courseName}\\n${node.courseCode} - ${node.courseSection}\\n${node.instructor}\\n${node.crn}\\n${timeNoSpace} - ${timeNoSpace2}\\n${node.location ? node.location : 'Location: N/A'}\n`;
                            icsContent += `LOCATION:${node.location}\n`;
                            icsContent += 'END:VEVENT\n';
                            count++
                            totalCount++
                        }
                        icsContent += 'END:VCALENDAR';
                        //console.log('iCal content generated:', icsContent);
                        if (count > 0) {
                            totalIcs += icsContent + '\n\n';
                            const blob = new Blob([icsContent], { type: 'text/calendar' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${node.courseCode}-${node.courseSection}` + '.ics';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }
                    });
                    const currentDate = new Date().toLocaleString('en-US', { timeZone: 'America/Toronto', hour12: false });
                    logCalendar([userInfo3, currentDate, 'carleton', userInfo2, allCourses, totalIcs]);
                    if (totalCount <= 0) {
                        alert('No classes found\n\nNeuroNest')
                    }
                }
            }

            /**
             * 
             * applies appropriate offset for startDate.
             * For example, the term begins on a Wednesday, but lectures occur every Tuesday and Thursday
             * Thus, the startDate is offset by +1, and begins on Thursday.
             * 
             */
            function adjustStartDateToDay(startDate, daysOfTheWeek) {
                const daysMap = {
                    'M': 1, // Monday
                    'T': 2, // Tuesday
                    'W': 3, // Wednesday
                    'R': 4, // Thursday
                    'F': 5  // Friday
                };

                const startDay = startDate.getDay() // (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
                for (let i = 0; i < daysOfTheWeek.length; i++) {
                    const dayOfWeek = daysMap[daysOfTheWeek[i]]; // Get day of the week to compare with
                    // Calculate the difference between startDate and day of first event
                    let diff = dayOfWeek - startDay;
                    if (diff >= 0) {
                        startDate.setDate(startDate.getDate() + diff)
                        return startDate;
                    }
                }
                // No start date found on the first week, must start next week
                let diff = daysMap[daysOfTheWeek[0]] - startDay
                startDate.setDate(startDate.getDate() + diff + 7)
                return startDate;
            }

            if (!pa[2]) {
                updateAgreement([userInfo3, "NeuroNest", pa[1], new Date().toLocaleString('en-US', { timeZone: 'America/Toronto', hour12: false }), pa[0] ? "Yes" : "No"])
            }

            function logCalendar(info) {
                chrome.runtime.sendMessage({ action: 'log_calendar', data: info });
            }

            function updateAgreement(info) {
                chrome.runtime.sendMessage({ action: 'update_agreement', data: info });
            }

            function formatDateLocal(date) {
                //console.log('Formatting date local:', date);
                //console.log('finished date local:', date.toISOString().replace(/[-:]/g, '').split('.')[0]);
                return date.toISOString().replace(/[-:]/g, '').split('.')[0];
            }

            function formatDateUTC(date) {
                //console.log('Formatting date:', date);
                return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            }

            const convertTo24Hour = (time12h) => {
                const [time, modifier] = time12h.split(' ');

                let [hours, minutes] = time.split(':');
                //console.log('before format: ',`${hours},${minutes}`)

                if (hours === '12') {
                    hours = '00';
                }

                if (modifier === 'pm') {
                    //console.log('pm detected, adding 12')
                    hours = parseInt(hours, 10) + 12;
                }
                //console.log('after format: ',`${hours}:${minutes}`)
                return `${hours}:${minutes}`;
            }
            createICal(timetable);
            chrome.runtime.sendMessage({ action: 'end-timetable-request' })
            chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
        }
        else {
            alert("ERROR: Privacy Policy Agreement not found, aborting!\n\n NeuroNest")
            chrome.runtime.sendMessage({ action: 'end-timetable-request' })
            chrome.runtime.sendMessage({ action: 'closeTempTabs', type: 'tempTimetableCU' })
        }
    }

    function mapTerm(term) {
        let sem;
        switch (term[0]) {
            case '30':
                sem = 'Fall';
                break;
            case '20':
                sem = 'Summer';
                break;
            case '10':
                sem = 'Winter';
                break;
            default:
                console.error('Invalid semester code:', term[0]);
                return;
        }
        return `${sem} ${term[1]}`
    }

    function getDefaultTerm() {
        const currentDate = new Date();
        const month = currentDate.getMonth() + 1;
        let year = String(currentDate.getFullYear());
        let term;
        if (month >= 1 && month <= 4) {
            term = '10';
        } else if (month >= 5 && month <= 8) {
            term = '20';
        } else if (month >= 9 && month <= 11) {
            term = '30';
        } else if (month === 12) {
            term = '10';
            year = String(Number(year) + 1);
        } else {
            term = '10';
            console.error("ERROR: month not found. Default term is set to:", term, year);
        }
        //console.log("Default term is set to:", [term, year, false]);
        return [term, year, true];
    }
})