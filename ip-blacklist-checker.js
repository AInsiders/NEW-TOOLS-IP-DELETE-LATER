/**
 * Simple IP Blacklist Checker
 * Test IP addresses against DNS-based blacklists
 */

class IPBanTester {
    constructor() {
        this.ipClient = new IPServerClient();
        this.currentIP = null;
        this.init();
    }

    async init() {
        await this.detectUserIP();
        this.setupEventListeners();
    }

    setupEventListeners() {
        const checkBtn = document.getElementById('checkBtn');
        const ipInput = document.getElementById('ipInput');
        const copyCurrentIpBtn = document.getElementById('copyCurrentIpBtn');

        checkBtn.addEventListener('click', () => this.checkIP());
        ipInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkIP();
            }
        });

        // Copy current IP button
        copyCurrentIpBtn.addEventListener('click', () => {
            this.copyToClipboard(this.currentIP);
        });

        // Auto-detect user's IP
        this.detectUserIP();
    }

    async detectUserIP() {
        try {
            console.log('Detecting user IP...');
            
            // Try multiple methods to get the user's IP
            const ip = await this.getUserIP();
            
            if (ip) {
                this.currentIP = ip;
                
                const ipInput = document.getElementById('ipInput');
                const currentIpElement = document.getElementById('currentIp');
                const copyCurrentIpBtn = document.getElementById('copyCurrentIpBtn');
                
                ipInput.placeholder = `Your IP: ${ip} (check blacklists)`;
                currentIpElement.textContent = this.currentIP;
                
                // Show copy button for current IP
                copyCurrentIpBtn.style.display = 'flex';
                
                console.log('IP detected successfully:', ip);
            } else {
                throw new Error('No IP detected');
            }
        } catch (error) {
            console.error('Error detecting IP:', error);
            document.getElementById('currentIp').textContent = 'Unable to load';
            this.showMessage('Unable to detect your IP address', 'error');
        }
    }

    async getUserIP() {
        // Method 1: Try server-side detection
        try {
            const data = await this.ipClient.detectIP();
            if (data && data.ip) {
                return data.ip;
            }
        } catch (error) {
            console.log('Server-side IP detection failed, trying fallback...');
        }

        // Method 2: Try fallback server detection
        try {
            const data = await this.ipClient.detectIPFallback();
            if (data && data.ip) {
                return data.ip;
            }
        } catch (error) {
            console.log('Fallback server detection failed, trying direct API...');
        }

        // Method 3: Try direct API calls
        try {
            const response = await fetch('https://httpbin.org/ip');
            const data = await response.json();
            if (data && data.origin) {
                return data.origin;
            }
        } catch (error) {
            console.log('Direct API failed, trying alternative...');
        }

        // Method 4: Try alternative IP service
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            if (data && data.ip) {
                return data.ip;
            }
        } catch (error) {
            console.log('Alternative IP service failed');
        }

        return null;
    }

    async checkIP() {
        const ipInput = document.getElementById('ipInput');
        const ip = ipInput.value.trim();

        if (!ip) {
            this.showMessage('Please enter an IP address', 'error');
            return;
        }

        if (!this.isValidIP(ip)) {
            this.showMessage('Please enter a valid IP address', 'error');
            return;
        }

        this.setLoadingState(true);
        this.clearResults();

        try {
            const results = await this.checkBlacklists(ip);
            this.displayResults(ip, results);
        } catch (error) {
            console.error('Error checking IP:', error);
            this.showMessage('Error checking IP address', 'error');
        } finally {
            this.setLoadingState(false);
        }
    }

    isValidIP(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    async checkBlacklists(ip) {
        const blacklists = [
            'access.redhawk.org',
            'all.s5h.net',
            'b.barracudacentral.org',
            'bl.spamcop.net',
            'bl.tiopan.com',
            'blackholes.wirehub.net',
            'blacklist.sci.kun.nl',
            'block.dnsbl.sorbs.net',
            'blocked.hilli.dk',
            'bogons.cymru.com',
            'dev.null.dk',
            'dialup.blacklist.jippg.org',
            'dialups.mail-abuse.org',
            'dialups.visi.com',
            'dnsbl.abuse.ch',
            'dnsbl.anticaptcha.net',
            'dnsbl.antispam.or.id',
            'dnsbl.dronebl.org',
            'dnsbl.kempt.net',
            'dnsbl.sorbs.net',
            'dnsbl.tornevall.org',
            'dnsbl-1.uceprotect.net',
            'duinv.aupads.org',
            'dnsbl-2.uceprotect.net',
            'dnsbl-3.uceprotect.net',
            'dul.dnsbl.sorbs.net',
            'escalations.dnsbl.sorbs.net',
            'hil.habeas.com',
            'black.junkemailfilter.com',
            'http.dnsbl.sorbs.net',
            'intruders.docs.uu.se',
            'ips.backscatterer.org',
            'korea.services.net',
            'mail-abuse.blacklist.jippg.org',
            'misc.dnsbl.sorbs.net',
            'msgid.bl.gweep.ca',
            'new.dnsbl.sorbs.net',
            'no-more-funn.moensted.dk',
            'old.dnsbl.sorbs.net',
            'opm.tornevall.org',
            'proxy.bl.gweep.ca',
            'psbl.surriel.com',
            'pss.spambusters.org.ar',
            'rbl.schulte.org',
            'rbl.snark.net',
            'recent.dnsbl.sorbs.net',
            'relays.bl.gweep.ca',
            'relays.mail-abuse.org',
            'relays.nether.net',
            'rsbl.aupads.org',
            'smtp.dnsbl.sorbs.net',
            'socks.dnsbl.sorbs.net',
            'spam.dnsbl.sorbs.net',
            'spam.olsentech.net',
            'spamguard.leadmon.net',
            'spamsources.fabel.dk',
            'ubl.unsubscore.com',
            'web.dnsbl.sorbs.net',
            'zombie.dnsbl.sorbs.net',
            'bl.mailspike.net'
        ];

        const results = [];
        const promises = blacklists.map(async (blacklist) => {
            try {
                const isListed = await this.checkSingleBlacklist(ip, blacklist);
                results.push({
                    blacklist: blacklist,
                    listed: isListed,
                    status: isListed ? 'Listed' : 'Not Listed'
                });
            } catch (error) {
                results.push({
                    blacklist: blacklist,
                    listed: false,
                    status: 'Error',
                    error: error.message
                });
            }
        });

        await Promise.allSettled(promises);
        return results.sort((a, b) => a.blacklist.localeCompare(b.blacklist));
    }

    async checkSingleBlacklist(ip, blacklist) {
        return new Promise((resolve, reject) => {
            const reversedIP = ip.split('.').reverse().join('.');
            const query = `${reversedIP}.${blacklist}`;
            
            // Create a test image to check if the IP is listed
            const img = new Image();
            const timeout = setTimeout(() => {
                img.src = '';
                resolve(false); // Timeout = not listed
            }, 3000); // Reduced timeout for faster results

            img.onload = function() {
                clearTimeout(timeout);
                resolve(true); // Image loaded = listed
            };

            img.onerror = function() {
                clearTimeout(timeout);
                resolve(false); // Error = not listed
            };

            // Use HTTP instead of HTTPS for better compatibility
            img.src = `http://${query}`;
        });
    }

    displayResults(ip, results) {
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.style.display = 'block';

        // Create the blacklist results display
        const blacklistSection = document.createElement('div');
        blacklistSection.className = 'blacklist-results';
        blacklistSection.innerHTML = `
            <h3 style="color: var(--text-primary); margin-bottom: 1.5rem;">
                <i class="fas fa-list"></i> Blacklist Check Results for ${ip}
            </h3>
            <div class="blacklist-grid"></div>
        `;

        // Clear existing content and add new section
        resultsSection.innerHTML = '';
        resultsSection.appendChild(blacklistSection);

        const blacklistGrid = blacklistSection.querySelector('.blacklist-grid');
        
        results.forEach(result => {
            const resultDiv = document.createElement('div');
            resultDiv.className = `blacklist-item ${result.listed ? 'listed' : 'not-listed'}`;
            
            const statusIcon = result.listed ? 'fas fa-ban' : 'fas fa-check';
            const statusColor = result.listed ? '#ff4444' : '#00aa00';
            
            resultDiv.innerHTML = `
                <div class="blacklist-name">${result.blacklist}</div>
                <div class="blacklist-status" style="color: ${statusColor};">
                    <i class="${statusIcon}"></i>
                    ${result.status}
                </div>
            `;
            
            blacklistGrid.appendChild(resultDiv);
        });

        // Add summary
        const listedCount = results.filter(r => r.listed).length;
        const totalCount = results.length;
        
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'blacklist-summary';
        summaryDiv.innerHTML = `
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-label">Total Blacklists:</span>
                    <span class="stat-value">${totalCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Listed:</span>
                    <span class="stat-value listed">${listedCount}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Not Listed:</span>
                    <span class="stat-value not-listed">${totalCount - listedCount}</span>
                </div>
            </div>
        `;
        
        blacklistSection.appendChild(summaryDiv);
    }

    setLoadingState(loading) {
        const checkBtn = document.getElementById('checkBtn');
        const ipInput = document.getElementById('ipInput');

        if (loading) {
            checkBtn.disabled = true;
            ipInput.disabled = true;
            checkBtn.innerHTML = '<div class="loading-spinner"></div> Checking...';
        } else {
            checkBtn.disabled = false;
            ipInput.disabled = false;
            checkBtn.innerHTML = '<i class="fas fa-search"></i> Check Blacklists';
        }
    }

    clearResults() {
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.style.display = 'none';
        resultsSection.innerHTML = '';
    }

    showMessage(message, type = 'info') {
        const messageContainer = document.getElementById('messageContainer');
        messageContainer.textContent = message;
        messageContainer.className = `message-container ${type}`;
        messageContainer.style.display = 'block';
    }

    hideMessage() {
        const messageContainer = document.getElementById('messageContainer');
        messageContainer.style.display = 'none';
    }

    async copyToClipboard(text) {
        if (!text || text === 'N/A') {
            this.showMessage('No IP address to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showCopySuccess();
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showCopySuccess();
            } catch (fallbackErr) {
                this.showMessage('Failed to copy IP address', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    showCopySuccess() {
        // Show success message
        this.showMessage('IP address copied to clipboard!', 'success');
        
        // Update button appearance temporarily
        const copyButtons = document.querySelectorAll('.copy-ip-btn');
        copyButtons.forEach(btn => {
            const originalHTML = btn.innerHTML;
            btn.classList.add('copied');
            btn.innerHTML = '<i class="fas fa-check"></i><span>Copied!</span>';
            
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.innerHTML = originalHTML;
            }, 2000);
        });
    }
}

// Initialize the ban tester when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    window.ipBanTester = new IPBanTester();
}); 