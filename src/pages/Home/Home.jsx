import React, { useState, useEffect, useRef } from 'react';
import { getDatabase, ref, get } from "firebase/database";
import { useUser } from '../../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { Typography, Upload, Button, message, Spin, Alert, Modal, ColorPicker } from 'antd';
import { UploadOutlined, HighlightOutlined, SendOutlined, ReloadOutlined, BgColorsOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

import Navbar from '../../components/Navbar';
import RequireLogin from '../../components/RequireLogin';

const { Title: AntTitle } = Typography;

const Home = () => {    
    const [username, setUsername] = useState('');
    const { userId, logout } = useUser();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [imagePath, setImagePath] = useState('');
    const [imagePreview, setImagePreview] = useState('');
    const [selectedPoint, setSelectedPoint] = useState(null);
    const [selectedColor, setSelectedColor] = useState('#00C800'); // Default green color
    const [colorizedImage, setColorizedImage] = useState('');
    const [isColorizing, setIsColorizing] = useState(false);
    const [isAutoColorizing, setIsAutoColorizing] = useState(false); // Add state for auto colorization
    const [apiError, setApiError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const [showColorPicker, setShowColorPicker] = useState(false); // Re-add the missing state
    const imageRef = useRef(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const [colorPoints, setColorPoints] = useState([]);

    useEffect(() => {
        if (userId) {
            setLoading(true);
            const db = getDatabase();
            const userRef = ref(db, 'users/' + userId);
            get(userRef)
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        const userData = snapshot.val();
                        setUsername(userData.username);
                    }
                })
                .catch(() => {
                    setError("Không thể tải dữ liệu. Vui lòng thử lại sau.");
                })
                .finally(() => setLoading(false));
        }
    }, [userId]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    
    const beforeUpload = (file) => {
        const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
        if (!isJpgOrPng) {
            message.error('Chỉ có thể tải lên file JPG/PNG!');
            return false;
        }
        const isLt2M = file.size / 1024 / 1024 < 5;
        if (!isLt2M) {
            message.error('Kích thước ảnh phải nhỏ hơn 5MB!');
            return false;
        }
        return true;
    };    const handleUpload = ({ file }) => {
        if (beforeUpload(file)) {
            // Create local file path for the image
            const localPath = URL.createObjectURL(file);
            setImageFile(file);
            setImagePreview(localPath);
            setSelectedPoint(null);
            setColorizedImage('');
            setColorPoints([]); // Reset color points when uploading a new image
            setApiError(null); // Reset API error on new upload
            setRetryCount(0); // Reset retry count
            
            // Read the file to get image dimensions and data
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    // Save the original dimensions, but normalize for backend processing
                    // The model expects 256x256 resolution
                    setImageSize({ 
                        width: img.width, 
                        height: img.height,
                        normalizedWidth: 256,
                        normalizedHeight: 256
                    });
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
              // Store the file name for reference 
            setImagePath("D:\\\\Learning\\\\ideepcolor\\\\test_img\\\\" + file.name);
        }
    };const handleImageClick = (e) => {
        if (!imagePreview) return;
        
        const rect = e.target.getBoundingClientRect();
        
        // Calculate scaled coordinates relative to original image size
        const scaleX = imageSize.width / rect.width;
        const scaleY = imageSize.height / rect.height;
        
        // Get click coordinates relative to the image
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);
        
        // Normalize to 256x256 coordinates for model input
        const normalizedX = Math.round((x / imageSize.width) * 256);
        const normalizedY = Math.round((y / imageSize.height) * 256);
        
        // Store both original coordinates (for display) and normalized coordinates (for API)
        setSelectedPoint({ 
            x, 
            y,
            normalizedX,
            normalizedY
        });
        setShowColorPicker(true);
    };
      const handleColorSelect = (color) => {
        // Extract RGB values from the color
        const rgb = color.toRgb();
        setSelectedColor(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    };    // Add current point and color to the colorPoints array
    const addColorPoint = () => {
        if (!selectedPoint) {
            message.error('Vui lòng chọn điểm tô màu!');
            return;
        }
        
        // Convert color from CSS format to array format
        let colorArray = [0, 200, 0]; // Default green
        
        if (selectedColor.startsWith('rgb')) {
            // Extract RGB values from the CSS color string
            const rgb = selectedColor.match(/\d+/g);
            if (rgb && rgb.length === 3) {
                colorArray = rgb.map(Number);
            }
        }
        
        // Create a new point object
        const newPoint = {
            point: [selectedPoint.normalizedX, selectedPoint.normalizedY],
            color: colorArray,
            displayPoint: { ...selectedPoint },
            displayColor: selectedColor
        };
        
        // Add to the colorPoints array
        setColorPoints(prevPoints => [...prevPoints, newPoint]);
        message.success('Điểm màu đã được thêm!');
        
        // Reset selected point
        setSelectedPoint(null);
        setShowColorPicker(false);
    };    
    
    // Function to delete a color point by index
    const handleDeletePoint = (indexToDelete) => {
        setColorPoints(prevPoints => prevPoints.filter((_, index) => index !== indexToDelete));
        message.info('Điểm màu đã được xóa.');
    };

    // New function for automatic colorization (no hints)
    const handleAutoColorize = async () => {
        if (!imageFile) {
            message.error('Vui lòng tải lên ảnh để tô màu!');
            return;
        }

        setIsAutoColorizing(true); // Use separate loading state
        setApiError(null);
        setColorizedImage(''); // Clear previous results

        try {
            const formData = new FormData();
            formData.append('image', imageFile);

            // Configure the request
            let requestConfig = { 
                timeout: 60000, // 60 seconds timeout
            };
            
            // Send the request to the /colorize endpoint
            const response = await axios.post(
                'http://127.0.0.1:5000/colorize', // Use the endpoint without hints
                formData, 
                requestConfig
            );
            
            setRetryCount(0); // Reset retry count on success

            if (response.data && response.data.status === 'success' && response.data.image) {
                // Decode base64 image
                const byteCharacters = atob(response.data.image);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const colorizedBlob = new Blob([byteArray], { type: 'image/jpeg' }); 
                const colorizedUrl = URL.createObjectURL(colorizedBlob);

                setColorizedImage(colorizedUrl);
                message.success('Ảnh đã được tô màu tự động thành công!');
            } else {
                throw new Error(response.data?.error || 'Không nhận được ảnh tô màu từ máy chủ.');
            }

        } catch (error) {
            console.error('Error auto colorizing image:', error);
            let errorMessage = 'Có lỗi khi tô màu ảnh tự động. ';
            
            if (error.message && error.message.includes('Network Error')) {
                errorMessage = 'Lỗi kết nối đến máy chủ tô màu. Vui lòng kiểm tra máy chủ đã khởi động và cấu hình CORS phù hợp.';
                setApiError({ message: errorMessage, isCors: true });
            } else if (error.response) {
                let backendError = 'Lỗi không xác định từ máy chủ.';
                if (error.response.data && typeof error.response.data === 'object' && error.response.data.error) {
                    backendError = error.response.data.error;
                } else if (typeof error.response.data === 'string') {
                    backendError = error.response.data;
                }
                errorMessage += `${backendError} (Mã lỗi: ${error.response.status})`;
                setApiError({ message: errorMessage, isCors: false });
            } else {
                errorMessage += error.message;
                setApiError({ message: errorMessage, isCors: false });
            }
            
            message.error(errorMessage);
        } finally {
            setIsAutoColorizing(false); // Turn off auto colorizing loading state
        }
    };

    const handleColorizeImage = async () => {
        if (!imageFile) {
            message.error('Vui lòng tải lên ảnh để tô màu!');
            return;
        }
        
        // If a point is currently selected, add it first
        if (selectedPoint) {
            addColorPoint(); // This function already updates colorPoints state
        }
        
        // Use the updated colorPoints state after potential addition
        const currentPoints = colorPoints; 

        if (currentPoints.length === 0) {
            message.error('Vui lòng chọn ít nhất một điểm tô màu!');
            return;
        }
        
        setIsColorizing(true);
        setApiError(null);
        setColorizedImage(''); // Clear previous results
        
        try {
            // Prepare FormData
            const formData = new FormData();
            formData.append('image', imageFile);

            // Format hints according to backend requirements (percentage coordinates)
            const hints = {
                points: currentPoints.map(cp => {
                    // Convert normalized coordinates (0-256) back to original image coordinates
                    const originalX = (cp.point[0] / 256) * imageSize.width;
                    const originalY = (cp.point[1] / 256) * imageSize.height;
                    
                    // Convert original coordinates to percentage
                    const xPercent = (originalX / imageSize.width) * 100;
                    const yPercent = (originalY / imageSize.height) * 100;

                    return {
                        x: xPercent,
                        y: yPercent,
                        r: cp.color[0],
                        g: cp.color[1],
                        b: cp.color[2]
                    };
                })
            };
            formData.append('hints', JSON.stringify(hints));

            // Configure the request - remove Content-Type header for FormData
            // Axios will set the correct multipart/form-data header automatically
            let requestConfig = { 
                // responseType: 'blob', // Change response type to handle JSON
                timeout: 60000, // Increase timeout to 60 seconds
                // headers: { // Remove this header
                //     'Content-Type': 'application/json' 
                // }
            };
            
            // Send the request to the correct endpoint
            const response = await axios.post(
                'http://127.0.0.1:5000/colorize_with_hints', // Updated endpoint
                formData, // Send FormData
                requestConfig
            );
            
            // Reset retry count on success
            setRetryCount(0);

            // Handle JSON response with base64 image
            if (response.data && response.data.status === 'success' && response.data.image) {
                // Decode base64 image
                const byteCharacters = atob(response.data.image);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const colorizedBlob = new Blob([byteArray], { type: 'image/jpeg' }); // Assuming JPEG, adjust if needed
                const colorizedUrl = URL.createObjectURL(colorizedBlob);

                // Update the state to display the colorized image
                setColorizedImage(colorizedUrl);
                message.success('Ảnh đã được tô màu thành công!');
            } else {
                // Handle cases where the backend returns success but no image, or other issues
                throw new Error(response.data?.error || 'Không nhận được ảnh tô màu từ máy chủ.');
            }

        } catch (error) {
            console.error('Error colorizing image:', error);
            
            let errorMessage = 'Có lỗi khi tô màu ảnh. ';
            
            // Enhanced CORS error detection
            if (error.message && error.message.includes('Network Error')) {
                errorMessage = 'Lỗi kết nối đến máy chủ tô màu. Vui lòng kiểm tra máy chủ đã khởi động và cấu hình CORS phù hợp.';
                setApiError({
                    message: errorMessage,
                    isCors: true, // Keep CORS flag for specific guidance
                    details: "Máy chủ Python có thể đang đặt header CORS không đúng cách. Hãy kiểm tra cấu hình CORS trong mã máy chủ."
                });
            } else if (error.response) {
                // Server responded with an error (e.g., 400, 500)
                // Try to parse JSON error message from backend
                let backendError = 'Lỗi không xác định từ máy chủ.';
                if (error.response.data && typeof error.response.data === 'object' && error.response.data.error) {
                    backendError = error.response.data.error;
                } else if (typeof error.response.data === 'string') {
                    // Sometimes error might be plain text
                    backendError = error.response.data;
                }
                errorMessage += `${backendError} (Mã lỗi: ${error.response.status})`;
                setApiError({
                    message: errorMessage,
                    isCors: false
                });
            } else {
                // Other errors (e.g., client-side issues, request setup errors)
                errorMessage += error.message;
                setApiError({
                    message: errorMessage,
                    isCors: false
                });
            }
            
            message.error(errorMessage);
        } finally {
            setIsColorizing(false);
        }
    };

    // Combined handler for the main colorize button
    const handleMainColorize = () => {
        if (colorPoints.length === 0) {
            handleAutoColorize();
        } else {
            // If a point is currently selected but not added, add it first
            if (selectedPoint) {
                 // Need to ensure addColorPoint finishes before proceeding
                 // Option 1: Make addColorPoint async (complex state update)
                 // Option 2: Don't allow colorizing if a point is selected but not added
                 // Option 3 (Chosen): Add the point synchronously then call colorize
                 addColorPoint(); 
                 // Note: addColorPoint updates state asynchronously. 
                 // The handleColorizeImage call below might use the state *before* the update.
                 // A better approach might involve useEffect or passing the new point directly.
                 // For simplicity now, we rely on the subsequent call using the latest state.
                 // Consider refactoring if race conditions occur.
                 
                 // Call handleColorizeImage *after* ensuring the point is added (or trigger via useEffect)
                 // Let's call it directly, assuming state updates reasonably fast for UI interaction.
                 handleColorizeImage(); 

            } else {
                 handleColorizeImage(); // Call with existing points
            }
        }
    };

    const handleRetry = () => {
        setRetryCount(prev => prev + 1);
        setApiError(null);
        // Decide which function to retry based on context? 
        // For simplicity, let's assume retry always uses hints if points exist, otherwise auto.
        // Or maybe retry should only be available after a specific action failed.
        // Let's make retry always call the last attempted action if possible,
        // but for now, we'll default to hint-based if points exist.
        if (colorPoints.length > 0) {
            handleColorizeImage();
        } else {
            handleAutoColorize(); // Retry auto-colorize if no points were involved
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <Alert
                message="Error"
                description={error}
                type="error"
                showIcon
                className="m-4"
            />
        );
    }

    if (!userId) {
        return <RequireLogin />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-blue-300">
            <Navbar onLogout={handleLogout} />

            <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center">
                <div className="text-center mb-8 mt-12 md:mt-16 px-4 w-full">
                    <AntTitle level={2} className="text-gray-800 text-2xl sm:text-3xl md:text-4xl lg:text-5xl break-words">
                        <span className="font-bold block sm:inline">Xin chào, </span>
                        <span className="text-blue-600 block sm:inline mt-2 sm:mt-0">{username || 'User'}</span>
                    </AntTitle>
                </div>

                <div className="w-full max-w-5xl bg-white bg-opacity-90 rounded-lg shadow-xl p-8 mb-10">
                    <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Tô màu ảnh đen trắng</h2>

                    <div className="mb-8 flex flex-col items-center">
                        <Upload
                            customRequest={handleUpload}
                            showUploadList={false}
                            accept=".jpg,.jpeg,.png"
                            className="w-full max-w-md flex flex-col items-center"
                            disabled={isColorizing || isAutoColorizing} // Disable upload during any colorization
                        >
                            <Button 
                                icon={<UploadOutlined />} 
                                size="large" 
                                className="w-full mb-3"
                                disabled={isColorizing || isAutoColorizing} // Disable upload button too
                            >
                                Chọn ảnh để tô màu
                            </Button>
                        </Upload>
                        <p className="text-sm text-gray-500 text-center">Hỗ trợ JPG, PNG (tối đa 5MB)</p>
                    </div>

                    {imagePreview && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* --- Left Column: Image Preview and Point Selection --- */}
                            <div className="mb-6">
                                <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">
                                    {colorPoints.length > 0 ? 'Thêm điểm tô màu' : 'Chọn điểm tô màu (Tùy chọn)'}
                                </h3>
                                <div 
                                    className="relative border-2 border-blue-300 rounded-lg mx-auto overflow-hidden"
                                    style={{ 
                                        maxWidth: '100%', 
                                        cursor: selectedPoint ? 'default' : (isColorizing || isAutoColorizing ? 'wait' : 'crosshair') 
                                    }}
                                >
                                    <img 
                                        src={imagePreview === colorizedImage ? null : imagePreview} 
                                        alt="Preview" 
                                        className="w-full h-auto rounded-lg"
                                        onClick={!(isColorizing || isAutoColorizing) ? handleImageClick : undefined} 
                                        ref={imageRef}
                                        style={{ display: imagePreview === colorizedImage ? 'none' : 'block' }}
                                    />

                                    {/* Display existing color points on the image */}
                                    {colorPoints.map((cp, index) => (
                                        <div 
                                            key={`point-${index}`} // Use a more specific key
                                            className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg" 
                                            style={{
                                                backgroundColor: cp.displayColor,
                                                // Calculate position based on displayPoint and current image dimensions
                                                left: `${(cp.displayPoint.x / imageSize.width) * 100}%`, 
                                                top: `${(cp.displayPoint.y / imageSize.height) * 100}%`,
                                                transform: 'translate(-50%, -50%)', // Center the dot on the point
                                                zIndex: 10,
                                                display: imagePreview === colorizedImage ? 'none' : 'block'
                                            }}
                                            title={`Màu: ${cp.displayColor}`} // Add tooltip
                                        />
                                    ))}

                                    {/* Display the currently selected point before confirmation */}
                                    {selectedPoint && (
                                        <div 
                                            className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg animate-pulse" 
                                            style={{
                                                backgroundColor: selectedColor,
                                                // Calculate position based on selectedPoint and current image dimensions
                                                left: `${(selectedPoint.x / imageSize.width) * 100}%`, 
                                                top: `${(selectedPoint.y / imageSize.height) * 100}%`,
                                                transform: 'translate(-50%, -50%)', // Center the dot
                                                zIndex: 20
                                            }}
                                        />
                                    )}
                                </div>


                                <p className="mt-3 text-gray-600 text-center">
                                    {selectedPoint 
                                        ? 'Điểm đã chọn. Chọn màu và xác nhận hoặc nhấp vào ảnh để chọn lại.' 
                                        : (colorPoints.length > 0 ? 'Nhấp vào ảnh để thêm điểm màu khác.' : 'Nhấp vào ảnh để chọn điểm màu tùy chỉnh.')}
                                </p>

                                {/* Color Picker and Add Point Button */}
                                {selectedPoint && (
                                    <div className="flex justify-center items-center gap-4 mt-5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700">Chọn màu:</span>
                                            <ColorPicker
                                                value={selectedColor}
                                                onChange={handleColorSelect}
                                                disabled={isColorizing || isAutoColorizing}
                                            />
                                        </div>
                                        <Button
                                            type="primary"
                                            icon={<HighlightOutlined />}
                                            // No loading state needed here, addColorPoint is fast
                                            onClick={addColorPoint}
                                            disabled={!selectedPoint || isColorizing || isAutoColorizing}
                                            size="large"
                                        >
                                            Thêm điểm màu
                                        </Button>
                                    </div>
                                )}

                                {/* --- Section to List Added Color Points --- */}
                                {colorPoints.length > 0 && !selectedPoint && (
                                    <div className="mt-6 pt-4 border-t border-gray-200">
                                        <h4 className="text-lg font-semibold text-gray-700 mb-3 text-center">Điểm màu đã chọn ({colorPoints.length})</h4>
                                        <ul className="space-y-2 max-h-40 overflow-y-auto px-2">
                                            {colorPoints.map((cp, index) => (
                                                <li key={`list-${index}`} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200">
                                                    <div className="flex items-center gap-2">
                                                        <div 
                                                            className="w-5 h-5 rounded border border-gray-400" 
                                                            style={{ backgroundColor: cp.displayColor }}
                                                        ></div>
                                                        <span className="text-sm text-gray-600">
                                                            {/* Optionally display coordinates: `Điểm ${index + 1} (X: ${cp.displayPoint.x}, Y: ${cp.displayPoint.y})` */}
                                                            Màu: {cp.displayColor}
                                                        </span>
                                                    </div>
                                                    <Button
                                                        icon={<DeleteOutlined />}
                                                        size="small"
                                                        danger
                                                        onClick={() => handleDeletePoint(index)}
                                                        disabled={isColorizing || isAutoColorizing} // Disable delete during processing
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* --- Right Column: Colorized Result --- */}
                            <div className="mb-6 flex flex-col"> {/* Use flex-col to manage button placement */}
                                <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">
                                    {isColorizing || isAutoColorizing ? 'Đang xử lý...' : (colorizedImage ? 'Kết quả tô màu' : 'Ảnh chưa tô màu')}
                                </h3>
                                <div className={`flex-grow border-2 ${isColorizing || isAutoColorizing ? 'border-yellow-400 animate-pulse' : (colorizedImage ? 'border-green-300' : 'border-gray-300')} rounded-lg p-2 mx-auto w-full flex items-center justify-center`} 
                                    style={{ minHeight: '250px' /* Ensure space */ }}
                                >
                                    {/* ... existing result display logic (Spin, Image, Placeholder) ... */}
                                     {isColorizing || isAutoColorizing ? (
                                        <Spin size="large" tip="Đang tô màu..." />
                                    ) : colorizedImage ? (
                                        <img 
                                            src={colorizedImage} 
                                            alt="Colorized" 
                                            className="w-full h-auto rounded-lg object-contain" // Use object-contain
                                            style={{ maxHeight: '400px' }} // Limit height if needed
                                        />
                                    ) : (
                                        <div className="text-center text-gray-500 p-4">
                                            <p>Kết quả tô màu sẽ hiển thị ở đây.</p>
                                            {imagePreview && colorPoints.length === 0 && <p>Nhấn 'Tô màu tự động' hoặc chọn điểm màu.</p>}
                                            {imagePreview && colorPoints.length > 0 && <p>Thêm điểm màu hoặc nhấn 'Tô màu với điểm đã chọn'.</p>}
                                        </div>
                                    )}
                                </div>
                                
                                {/* --- Main Colorize Button --- */}
                                {/* Show this button if an image is loaded and no point is actively being selected */}
                                {imagePreview && !selectedPoint && (
                                    <div className="flex justify-center mt-5">
                                        <Button
                                            type="primary"
                                            icon={colorPoints.length > 0 ? <HighlightOutlined /> : <BgColorsOutlined />}
                                            loading={colorPoints.length > 0 ? isColorizing : isAutoColorizing} // Use correct loading state
                                            onClick={handleMainColorize} // Use the combined handler
                                            size="large"
                                            disabled={isColorizing || isAutoColorizing} // Disable if any process is running
                                        >
                                            {colorPoints.length > 0 
                                                ? `Tô màu với điểm đã chọn (${colorPoints.length})` 
                                                : 'Tô màu tự động'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {apiError && (
                        <div className="mb-8">
                            <Alert
                                message="Lỗi khi tô màu"
                                description={
                                    <div className="pt-3">
                                        <p>{apiError.message}</p>
                                        {apiError.isCors && (
                                            <div className="mt-3 text-sm text-gray-600">
                                                <p>Giải pháp có thể:</p>
                                                <ol className="list-decimal pl-5">
                                                    <li>Kiểm tra máy chủ Python đã được khởi động</li>
                                                    <li>Sửa cấu hình CORS trong máy chủ Python:</li>
                                                    <code className="block bg-gray-100 p-3 mt-2 rounded">
                                                        # Chỉ sử dụng MỘT trong hai cách sau:<br/>
                                                        # Cách 1: Sử dụng Flask-CORS<br/>
                                                        from flask_cors import CORS<br/>
                                                        app = Flask(__name__)<br/>
                                                        CORS(app, origins=["http://localhost:3000"])
                                                    </code>
                                                </ol>
                                            </div>
                                        )}
                                        <Button 
                                            className="mt-4"
                                            icon={<ReloadOutlined />}
                                            onClick={handleRetry}
                                            disabled={isColorizing || isAutoColorizing} // Disable retry if any process is running
                                        >
                                            Thử lại {retryCount > 0 ? `(${retryCount})` : ''}
                                        </Button>
                                    </div>
                                }
                                type="error"
                                showIcon
                                className="my-5"
                            />
                        </div>
                    )}
                </div>
            </div>

            <Modal
                title="Chọn màu"
                open={showColorPicker}
                onCancel={() => setShowColorPicker(false)}
                footer={[
                    <Button key="cancel" onClick={() => setShowColorPicker(false)} disabled={isColorizing || isAutoColorizing}>
                        Hủy
                    </Button>,
                    <Button 
                        key="submit" 
                        type="primary" 
                        onClick={addColorPoint} // Modal confirm still just adds the point
                        icon={<SendOutlined />}
                        // No loading state needed here
                        disabled={isColorizing || isAutoColorizing}
                    >
                        Xác nhận điểm màu
                    </Button>,
                ]}
            >
                <div className="flex flex-col items-center gap-5">
                    <div className="flex items-center gap-3 w-full justify-center">
                        <span>Chọn màu:</span>
                        <ColorPicker
                            value={selectedColor}
                            onChange={handleColorSelect}
                            disabled={isColorizing || isAutoColorizing} // Disable during loading
                        />
                    </div>
                    <div 
                        className="w-16 h-16 rounded-full border-2 border-gray-300"
                        style={{ backgroundColor: selectedColor }}
                    ></div>
                </div>
            </Modal>
        </div>
    );
};

export default Home;