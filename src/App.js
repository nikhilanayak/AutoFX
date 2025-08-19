import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// OpenAI API configuration
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || 'your-api-key-here';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Debug environment variables
console.log('🌍 DEBUG: Environment Variables');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('OPENAI_API_KEY configured:', OPENAI_API_KEY ? 'Yes' : 'No');
console.log('OPENAI_API_KEY value:', OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 10)}...` : 'Not set');
console.log('OPENAI_API_URL:', OPENAI_API_URL);

function App() {
	console.log('🚀 DEBUG: App component initialized');
	const [ffmpeg, setFfmpeg] = useState(null);
	const [loaded, setLoaded] = useState(false);
	const [uploadedFiles, setUploadedFiles] = useState([]);
	const [currentStep, setCurrentStep] = useState('upload'); // 'upload' or 'prompt'
	const [prompt, setPrompt] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [processingStatus, setProcessingStatus] = useState('');
	const [currentCommand, setCurrentCommand] = useState('');
	const fileInputRef = useRef(null);

	useEffect(() => {
		loadFFmpeg();
	}, []);

	// Global escape key handler
	useEffect(() => {
		const handleGlobalKeyDown = (event) => {
			if (event.key === 'Escape') {
				if (isProcessing) {
					// Close window but keep processing running
					if (window.electronAPI) {
						window.electronAPI.closeOverlay();
					}
					return;
				}
				
				if (currentStep === 'prompt') {
					// Reset to main menu if on prompt step
					setCurrentStep('upload');
					setPrompt('');
				} else {
					// Close overlay if on upload step
					if (window.electronAPI) {
						window.electronAPI.closeOverlay();
					}
				}
			}
		};

		document.addEventListener('keydown', handleGlobalKeyDown);
		
		return () => {
			document.removeEventListener('keydown', handleGlobalKeyDown);
		};
	}, [isProcessing, currentStep]);

	const loadFFmpeg = async () => {
		console.log('🔧 DEBUG: Loading FFmpeg...');
		try {
			console.log('🏗️ Creating FFmpeg instance...');
			const ffmpegInstance = new FFmpeg();

			// Add progress listener
			console.log('📊 Adding progress listener...');
			ffmpegInstance.on('progress', ({ progress: p, time }) => {
				console.log(`📈 Progress: ${Math.round(p * 100)}%, Time: ${time}s`);
				setProgress(Math.round(p * 100));
				if (time) {
					setProcessingStatus(`Processing... ${Math.round(p * 100)}% (${time}s)`);
				}
			});

			// Load FFmpeg with CORS proxy for development
			const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';
			console.log('📦 Base URL:', baseURL);
			
			console.log('🌐 Creating blob URLs...');
			const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
			const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
			console.log('✅ Blob URLs created:', { coreURL, wasmURL });
			
			console.log('⚡ Loading FFmpeg core...');
			await ffmpegInstance.load({
				coreURL,
				wasmURL,
			});

			console.log('✅ FFmpeg loaded successfully');
			setFfmpeg(ffmpegInstance);
			setLoaded(true);
		} catch (error) {
			console.error('❌ FFmpeg load error:', error);
			console.error('❌ Error details:', {
				message: error.message,
				stack: error.stack,
				name: error.name
			});
		}
	};

	const validateVideoFile = (file) => {
		if (!file || file.size === 0) {
			return 'File is empty or invalid.';
		}

		if (file.size > 100 * 1024 * 1024) {
			return 'File size too large. Please use files under 100MB.';
		}

		if (!file.type.startsWith('video/')) {
			return 'Please select a valid video file.';
		}

		const validExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp'];
		const fileExtension = file.name.split('.').pop().toLowerCase();
		if (!validExtensions.includes(fileExtension)) {
			return `Unsupported file format: ${fileExtension}`;
		}

		return null;
	};

	const handleFileSelect = (event) => {
		const files = Array.from(event.target.files);
		const validFiles = [];

		files.forEach(file => {
			const validationError = validateVideoFile(file);
			if (!validationError) {
				validFiles.push(file);
			}
		});

		if (validFiles.length > 0) {
			setUploadedFiles(prev => [...prev, ...validFiles]);
		}
	};

	const handleDrop = (event) => {
		event.preventDefault();
		const files = Array.from(event.dataTransfer.files);
		const validFiles = [];

		files.forEach(file => {
			const validationError = validateVideoFile(file);
			if (!validationError) {
				validFiles.push(file);
			}
		});

		if (validFiles.length > 0) {
			setUploadedFiles(prev => [...prev, ...validFiles]);
		}
	};

	const handleDragOver = (event) => {
		event.preventDefault();
	};

	const handleDone = () => {
		if (uploadedFiles.length > 0) {
			setCurrentStep('prompt');
		}
	};

	const handleKeyPress = (event) => {
		if (event.key === 'Enter') {
			if (currentStep === 'upload') {
				handleDone();
			}
		}
		// Escape key handling is now done globally
	};

	const handleDoneKeyDown = (event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleDone();
		}
	};

	const cancelProcessing = () => {
		if (ffmpeg && isProcessing) {
			// Terminate FFmpeg process
			ffmpeg.terminate();
			// Reset all state and go back to home page
			setIsProcessing(false);
			setProgress(0);
			setProcessingStatus('');
			setCurrentCommand('');
			setCurrentStep('upload');
			setPrompt('');
			setUploadedFiles([]);
			// Reload FFmpeg for future use
			loadFFmpeg();
		}
	};

	const generateFFmpegCommand = async (userPrompt, fileName) => {
		console.log('🔍 DEBUG: generateFFmpegCommand called');
		console.log('📝 User prompt:', userPrompt);
		console.log('📁 File name:', fileName);
		console.log('🔑 API key configured:', OPENAI_API_KEY ? 'Yes' : 'No');
		console.log('🔑 API key value:', OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 10)}...` : 'Not set');
		
		if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-api-key-here') {
			console.error('❌ OpenAI API key not configured properly');
			throw new Error('OpenAI API key not configured');
		}

		const systemPrompt = `You are an expert FFmpeg command generator. Convert natural language requests into FFmpeg command arguments.

RULES:
1. Return ONLY the command arguments (not "ffmpeg" itself)
2. Input file is always referenced as "{INPUT_FILE}"
3. Output file should be "{OUTPUT_FILE}"
4. Use safe, common options only
5. If request is unclear, default to high-quality MP4 conversion
6. NEVER use quotes around filter arguments - they will be parsed as separate arguments

EXAMPLES:
User: "convert to mp4"
Response: -i {INPUT_FILE} -c:v libx264 -preset medium -crf 23 {OUTPUT_FILE}

User: "compress this video"
Response: -i {INPUT_FILE} -c:v libx264 -preset slow -crf 28 -c:a aac -b:a 128k {OUTPUT_FILE}

User: "make it smaller file size"
Response: -i {INPUT_FILE} -c:v libx264 -preset slow -crf 30 -vf scale=1280:-2 -c:a aac -b:a 96k {OUTPUT_FILE}

User: "resize to 720p"
Response: -i {INPUT_FILE} -c:v libx264 -preset medium -crf 23 -vf scale=1280:720 -c:a copy {OUTPUT_FILE}

User: "extract audio"
Response: -i {INPUT_FILE} -vn -c:a aac -q:a 2 {OUTPUT_FILE}

User: "speed up 2x"
Response: -i {INPUT_FILE} -filter:v setpts=0.5*PTS -filter:a atempo=2.0 -c:v libx264 -preset medium -crf 23 {OUTPUT_FILE}

User: "slow down by half"
Response: -i {INPUT_FILE} -filter:v setpts=2.0*PTS -filter:a atempo=0.5 -c:v libx264 -preset medium -crf 23 {OUTPUT_FILE}

User: "remove audio"
Response: -i {INPUT_FILE} -c:v copy -an {OUTPUT_FILE}

User: "better quality"
Response: -i {INPUT_FILE} -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k {OUTPUT_FILE}

User: "convert to gif"
Response: -i {INPUT_FILE} -vf fps=10,scale=320:-1:flags=lanczos -c:v gif {OUTPUT_FILE}

Now convert this request: "${userPrompt}"`;

		try {
			console.log('🚀 Making OpenAI API request...');
			console.log('🌐 API URL:', OPENAI_API_URL);
			
			const requestBody = {
				model: 'gpt-4',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				max_tokens: 200,
				temperature: 0.1
			};
			
			console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
			
			const response = await fetch(OPENAI_API_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${OPENAI_API_KEY}`
				},
				body: JSON.stringify(requestBody)
			});

			console.log('📥 Response status:', response.status);
			console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));

			if (!response.ok) {
				const errorText = await response.text();
				console.error('❌ OpenAI API error response:', errorText);
				throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
			}

			const data = await response.json();
			console.log('✅ OpenAI response data:', JSON.stringify(data, null, 2));
			
			const commandArgs = data.choices[0].message.content.trim();
			console.log('🔧 Raw command args:', commandArgs);
			
			// Determine output extension based on command content
			let outputExtension = '.mp4'; // default
			if (commandArgs.includes('-c:v gif') || commandArgs.includes('gif')) {
				outputExtension = '.gif';
			} else if (commandArgs.includes('-vn') || commandArgs.includes('aac') || commandArgs.includes('mp3')) {
				outputExtension = '.mp3';
			}
			
			// Replace placeholders with actual file names
			const outputFileName = `output_${fileName.replace(/\.[^/.]+$/, outputExtension)}`;
			
			// Parse command properly instead of simple string splitting
			const commandArray = [];
			const parts = commandArgs.trim().split(' ');
			
			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				
				if (part === '{INPUT_FILE}') {
					commandArray.push(fileName);
				} else if (part === '{OUTPUT_FILE}') {
					commandArray.push(outputFileName);
				} else {
					// Remove surrounding quotes if present (FFmpeg doesn't need them as separate args)
					let cleanPart = part;
					if ((cleanPart.startsWith('"') && cleanPart.endsWith('"')) || 
					    (cleanPart.startsWith("'") && cleanPart.endsWith("'"))) {
						cleanPart = cleanPart.slice(1, -1);
					}
					commandArray.push(cleanPart);
				}
			}

			console.log('🔧 Input file:', fileName);
			console.log('🔧 Output file:', outputFileName);
			console.log('🔧 Final command array:', commandArray);

			return { commandArray, outputFileName };
		} catch (error) {
			console.error('❌ OpenAI API error:', error);
			console.error('❌ Error details:', {
				message: error.message,
				stack: error.stack,
				name: error.name
			});
			
			// Fallback to basic conversion if OpenAI fails
			const fallbackOutputName = `output_${fileName.replace(/\.[^/.]+$/, '.mp4')}`;
			const fallbackCommand = [
				'-i', fileName,
				'-c:v', 'libx264',
				'-preset', 'medium',
				'-crf', '23',
				fallbackOutputName
			];
			
			console.log('🔄 Using fallback command:', fallbackCommand);
			return { commandArray: fallbackCommand, outputFileName: fallbackOutputName };
		}
	};

	const handlePromptSubmit = async () => {
		console.log('🎬 DEBUG: handlePromptSubmit started');
		console.log('📝 Prompt:', prompt);
		console.log('🎞️ Uploaded files:', uploadedFiles);
		console.log('⚙️ FFmpeg instance:', ffmpeg ? 'Available' : 'Not loaded');
		
		if (!prompt.trim() || !ffmpeg || uploadedFiles.length === 0) {
			console.log('❌ Early return: Missing requirements');
			return;
		}
		
		setIsProcessing(true);
		setProgress(0);
		setProcessingStatus('Analyzing request with AI...');
		setCurrentCommand('');

		try {
			console.log(`🔄 Processing ${uploadedFiles.length} files`);
			
			// Process each uploaded file
			for (let i = 0; i < uploadedFiles.length; i++) {
				const file = uploadedFiles[i];
				console.log(`📁 Processing file ${i + 1}/${uploadedFiles.length}: ${file.name}`);
				setProcessingStatus(`Processing file ${i + 1} of ${uploadedFiles.length}: ${file.name}`);
				
				try {
					// Write file to FFmpeg filesystem
					console.log('💾 Writing file to FFmpeg filesystem...');
					await ffmpeg.writeFile(file.name, await fetchFile(file));
					console.log('✅ File written successfully');
					
					// Generate FFmpeg command using OpenAI
					console.log('🤖 Generating FFmpeg command with AI...');
					setProcessingStatus(`Generating command for: ${file.name}`);
					const { commandArray, outputFileName } = await generateFFmpegCommand(prompt, file.name);
					console.log('✅ Command generated:', commandArray);
					console.log('✅ Output file name:', outputFileName);
					
					// Display the exact command being executed
					setCurrentCommand(`ffmpeg ${commandArray.join(' ')}`);
					
					console.log('⚡ Executing FFmpeg command...');
					setProcessingStatus(`Executing: ${file.name}`);
					
					// Add error logging for FFmpeg
					ffmpeg.on('log', ({ message }) => {
						console.log('🔧 FFmpeg log:', message);
					});
					
					try {
						await ffmpeg.exec(commandArray);
						console.log('✅ FFmpeg execution completed');
					} catch (ffmpegError) {
						console.error('❌ FFmpeg execution failed:', ffmpegError);
						throw new Error(`FFmpeg execution failed: ${ffmpegError.message}`);
					}

					// Use the determined output file name
					const outputName = outputFileName;
					console.log('📤 Using output file name:', outputName);
					
					// Check if output file exists and read it
					console.log('📖 Reading output file...');
					
					try {
						const data = await ffmpeg.readFile(outputName);
						console.log('✅ Output file read, size:', data.length);
						
						if (data.length === 0) {
							console.error('❌ Output file is empty! FFmpeg may have failed silently.');
							console.log('🔍 Checking FFmpeg filesystem for files...');
							
							// List all files in FFmpeg filesystem for debugging
							try {
								const files = await ffmpeg.listDir('/');
								console.log('📁 Files in FFmpeg filesystem:', files);
							} catch (listError) {
								console.log('❌ Could not list FFmpeg filesystem');
							}
							
							throw new Error(`Output file "${outputName}" is empty. FFmpeg processing may have failed.`);
						}
					
						// Continue with successful processing
						console.log('✅ File data is valid, proceeding...');
					
					} catch (readError) {
						console.error('❌ Failed to read output file:', readError);
						throw new Error(`Could not read output file "${outputName}": ${readError.message}`);
					}
					
					// Re-read the file for processing (since we're outside the try block now)
					const data = await ffmpeg.readFile(outputName);
					
					// Determine MIME type based on file extension
					let mimeType = 'video/mp4';
					if (outputName.endsWith('.mp3') || outputName.endsWith('.aac')) {
						mimeType = 'audio/mpeg';
					} else if (outputName.endsWith('.webm')) {
						mimeType = 'video/webm';
					} else if (outputName.endsWith('.gif')) {
						mimeType = 'image/gif';
					}
					console.log('🎯 MIME type:', mimeType);
					
					// Save file and open with default application
					console.log('💾 Saving and opening file...');
					console.log('📊 File data info:', {
						dataType: data.constructor.name,
						dataLength: data.length,
						bufferLength: data.buffer ? data.buffer.byteLength : 'no buffer'
					});
					
					if (window.electronAPI && window.electronAPI.saveAndOpenFile) {
						try {
							// Convert Uint8Array to Base64 for reliable IPC transfer
							// Handle large files by chunking the conversion
							let binaryString = '';
							for (let i = 0; i < data.length; i++) {
								binaryString += String.fromCharCode(data[i]);
							}
							const base64Data = btoa(binaryString);
							console.log('🔄 Converted to base64, length:', base64Data.length);
							
							const result = await window.electronAPI.saveAndOpenFile(outputName, base64Data, mimeType);
							if (result.success) {
								console.log('✅ File saved and opened:', result.filePath);
							} else {
								console.error('❌ Failed to save/open file:', result.error);
								// Fallback to regular download
								const url = URL.createObjectURL(new Blob([data.buffer], { type: mimeType }));
								const a = document.createElement('a');
								a.href = url;
								a.download = outputName;
								a.click();
								URL.revokeObjectURL(url);
							}
						} catch (error) {
							console.error('❌ Error with save/open:', error);
							// Fallback to regular download
							const url = URL.createObjectURL(new Blob([data.buffer], { type: mimeType }));
							const a = document.createElement('a');
							a.href = url;
							a.download = outputName;
							a.click();
							URL.revokeObjectURL(url);
						}
					} else {
						// Fallback to regular download if not in Electron
						console.log('📥 Fallback: Creating download link...');
						const url = URL.createObjectURL(new Blob([data.buffer], { type: mimeType }));
						const a = document.createElement('a');
						a.href = url;
						a.download = outputName;
						a.click();
						URL.revokeObjectURL(url);
					}
					console.log('✅ File processing completed');
					
				} catch (fileError) {
					console.error(`❌ Error processing file ${file.name}:`, fileError);
					throw fileError;
				}
			}
			
			console.log('🎉 All files processed successfully');
			setProcessingStatus('Processing complete!');
			setTimeout(() => {
				// Reset all state to initial values
				setIsProcessing(false);
				setProgress(0);
				setProcessingStatus('');
				setCurrentCommand('');
				setCurrentStep('upload');
				setPrompt('');
				setUploadedFiles([]);
				
				// Close the window
				if (window.electronAPI) {
					console.log('🚪 Closing window after successful processing');
					window.electronAPI.closeOverlay();
				}
			}, 1500); // Slightly shorter delay for better UX
			
		} catch (error) {
			console.error('❌ Processing error:', error);
			console.error('❌ Error stack:', error.stack);
			setProcessingStatus(`Error: ${error.message}`);
			setTimeout(() => {
				setIsProcessing(false);
				setProgress(0);
				setProcessingStatus('');
				setCurrentCommand('');
			}, 3000);
		}
	};

	const handlePromptKeyPress = (event) => {
		if (event.key === 'Enter' && prompt.trim() && !isProcessing) {
			handlePromptSubmit();
		}
		// Escape key handling is now done globally
	};

	if (!loaded) {
		return (
			<div className="container">
				<div style={{ padding: '20px', textAlign: 'center' }}>
					<h3>Loading FFmpeg...</h3>
					<p>Check console for debug information</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className="container"
			onKeyDown={currentStep === 'upload' ? handleKeyPress : undefined}
			tabIndex={currentStep === 'upload' ? 0 : -1}
		>
			{/* Debug Panel - Remove this after debugging */}
			{process.env.NODE_ENV === 'development' && (
				<div style={{
					position: 'fixed',
					top: '10px',
					right: '10px',
					background: 'rgba(0,0,0,0.8)',
					color: 'white',
					padding: '10px',
					borderRadius: '5px',
					fontSize: '12px',
					zIndex: 1000,
					maxWidth: '300px',
					wordBreak: 'break-all'
				}}>
					<div><strong>DEBUG INFO</strong></div>
					<div>FFmpeg: {ffmpeg ? '✅' : '❌'}</div>
					<div>Loaded: {loaded ? '✅' : '❌'}</div>
					<div>Step: {currentStep}</div>
					<div>Files: {uploadedFiles.length}</div>
					<div>Processing: {isProcessing ? '✅' : '❌'}</div>
					<div>API Key: {OPENAI_API_KEY && OPENAI_API_KEY !== 'your-api-key-here' ? '✅' : '❌'}</div>
					<button 
						onClick={async () => {
							try {
								console.log('🧪 Testing OpenAI API...');
								const result = await generateFFmpegCommand('convert to mp4', 'test.mov');
								console.log('✅ API test successful:', result);
								alert('API test successful! Check console for details.');
							} catch (error) {
								console.error('❌ API test failed:', error);
								alert(`API test failed: ${error.message}`);
							}
						}}
						style={{ marginTop: '5px', fontSize: '10px', padding: '2px 5px' }}
					>
						Test API
					</button>
				</div>
			)}
			{currentStep === 'upload' ? (
				<div className="upload-section">
					<div
						className="upload-area"
						onDrop={handleDrop}
						onDragOver={handleDragOver}
						onClick={() => fileInputRef.current?.click()}
					>
						<p>Click to select or drag & drop media files</p>
						<input
							ref={fileInputRef}
							type="file"
							accept="video/*"
							multiple
							onChange={handleFileSelect}
							style={{ display: 'none' }}
						/>
					</div>

					{uploadedFiles.length > 0 && (
						<div className="files-list">
							{uploadedFiles.map((file, index) => (
								<div key={index} className="file-item">
									<span>{file.name}</span>
									<span className="file-size">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
								</div>
							))}
						</div>
					)}

					{uploadedFiles.length > 0 && (
						<>
							<div className="divider"></div>
							<div className="continue-text">Press Enter To Continue</div>
						</>
					)}
				</div>
			) : (
				<div className="prompt-section">
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={handlePromptKeyPress}
						placeholder="e.g., 'compress this video', 'resize to 720p', 'extract audio', 'speed up 2x'..."
						className="prompt-input"
						autoFocus
						disabled={isProcessing}
					/>
					
					{isProcessing && (
						<div className="progress-container">
							<div className="progress-bar">
								<div 
									className="progress-fill" 
									style={{ width: `${progress}%` }}
								></div>
							</div>
							<div className="progress-status">{processingStatus}</div>
							{currentCommand && (
								<div className="command-display">
									<div className="command-label">Running:</div>
									<div className="command-text">{currentCommand}</div>
								</div>
							)}
						</div>
					)}
					
					{!isProcessing && prompt.trim() && (
						<>
							<div className="divider"></div>
							<div className="continue-text">Press Enter To Continue</div>
						</>
					)}
					
					{isProcessing && (
						<button
							className="cancel-button"
							onClick={cancelProcessing}
							tabIndex={0}
						>
							Stop Processing
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export default App;
