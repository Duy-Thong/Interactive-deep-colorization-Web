import React, { useState, useEffect, useRef } from 'react';
import { getDatabase, ref, get } from "firebase/database";
import { useUser } from '../../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { Typography, Upload, Button, message, Spin, Alert, Modal, ColorPicker } from 'antd';
import { UploadOutlined, HighlightOutlined, SendOutlined, ReloadOutlined } from '@ant-design/icons';
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
    };    const handleColorizeImage = async () => {
        if (!imageFile) {
            message.error('Vui lòng tải lên ảnh để tô màu!');
            return;
        }
        
        // If a point is currently selected, add it first
        if (selectedPoint) {
            addColorPoint();
        }
        
        if (colorPoints.length === 0) {
            message.error('Vui lòng chọn ít nhất một điểm tô màu!');
            return;
        }
        
        setIsColorizing(true);
        setApiError(null);
        
        try {
            // Extract the points and colors arrays from colorPoints
            const userPoints = colorPoints.map(cp => cp.point);
            const userColors = colorPoints.map(cp => cp.color);
            
            // Configure the request with longer timeout
            let requestConfig = { 
                responseType: 'blob',
                timeout: 30000, // 30 second timeout
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            
            // Prepare the data in the format the backend expects
            const requestData = {
                image_path: imagePath,
                user_points: userPoints,
                user_colors_rgb: userColors
            };
            
            // Send the request to the server
            const response = await axios.post(
                'http://127.0.0.1:5000/colorize', 
                requestData, 
                requestConfig
            );
            
            // Reset retry count on success
            setRetryCount(0);
              // Create a blob URL from the response data
            const colorizedBlob = new Blob([response.data], { type: 'image/jpeg' });
            const colorizedUrl = URL.createObjectURL(colorizedBlob);
            
            // Update the state to display the colorized image
            setColorizedImage(colorizedUrl);
            // Don't update imagePreview to keep the original for further editing
            
            message.success('Ảnh đã được tô màu thành công!');
        } catch (error) {
            console.error('Error colorizing image:', error);
            
            let errorMessage = 'Có lỗi khi tô màu ảnh. ';
            
            // Enhanced CORS error detection
            if (error.message && error.message.includes('Network Error')) {
                errorMessage = 'Lỗi kết nối đến máy chủ tô màu. Vui lòng kiểm tra máy chủ đã khởi động và cấu hình CORS phù hợp.';
                setApiError({
                    message: errorMessage,
                    isCors: true,
                    details: "Máy chủ Python có thể đang đặt header CORS không đúng cách. Hãy kiểm tra cấu hình CORS trong mã máy chủ."
                });
            } else if (error.response) {
                // Server responded with an error
                errorMessage += error.response.data?.message || `Mã lỗi: ${error.response.status}`;
                setApiError({
                    message: errorMessage,
                    isCors: false
                });
            } else {
                // Other errors
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
    
    const handleRetry = () => {
        setRetryCount(prev => prev + 1);
        setApiError(null);
        handleColorizeImage();
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
            <Navbar onLogout={handleLogout}/>
            
            <div className="container mx-auto px-4 py-8 flex flex-col items-center justify-center">
                <div className="text-center mb-8 mt-12 md:mt-16 px-4 w-full">
                    <AntTitle level={2} className="text-gray-800 text-xl sm:text-2xl md:text-3xl lg:text-4xl break-words">
                        <span className="font-bold block sm:inline">Xin chào, </span>
                        <span className="text-blue-600 block sm:inline mt-2 sm:mt-0">{username || 'User'}</span>
                    </AntTitle>
                </div>

                {/* Image Colorization Section */}
                <div className="w-full max-w-4xl bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Tô màu ảnh đen trắng</h2>
                    
                    {/* Upload Section */}
                    <div className="mb-6">
                        <Upload
                            customRequest={handleUpload}
                            showUploadList={false}
                            accept=".jpg,.jpeg,.png"
                            className="w-full"
                        >
                            <Button 
                                icon={<UploadOutlined />} 
                                size="large" 
                                className="w-full mb-2"
                                disabled={isColorizing}
                            >
                                Chọn ảnh để tô màu
                            </Button>
                        </Upload>
                        <p className="text-sm text-gray-500 text-center">Hỗ trợ JPG, PNG (tối đa 5MB)</p>
                    </div>                    {/* Main Content Area - Side by Side Layout */}
                    {imagePreview && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Side - Original Image and Color Selection */}
                            <div className="mb-4">
                                <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">Chọn điểm tô màu</h3>
                                <div 
                                    className="relative border-2 border-blue-300 rounded-lg mx-auto"
                                    style={{ maxWidth: '100%', cursor: selectedPoint ? 'default' : 'crosshair' }}
                                >
                                    <img 
                                        src={imagePreview === colorizedImage ? null : imagePreview} 
                                        alt="Preview" 
                                        className="w-full h-auto rounded-lg"
                                        onClick={handleImageClick}
                                        ref={imageRef}
                                        style={{ display: imagePreview === colorizedImage ? 'none' : 'block' }}
                                    />
                                    
                                    {/* Display All Saved Color Points */}
                                    {colorPoints.map((cp, index) => (
                                        <div 
                                            key={index}
                                            className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg" 
                                            style={{
                                                backgroundColor: cp.displayColor,
                                                left: cp.displayPoint.x / (imageSize.width / (imageRef.current?.clientWidth || 1)) - 10,
                                                top: cp.displayPoint.y / (imageSize.height / (imageRef.current?.clientHeight || 1)) - 10,
                                                transform: 'translate(-50%, -50%)',
                                                zIndex: 10,
                                                display: imagePreview === colorizedImage ? 'none' : 'block'
                                            }}
                                        />
                                    ))}
                                    
                                    {/* Currently Selected Point Marker */}
                                    {selectedPoint && (
                                        <div 
                                            className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg animate-pulse" 
                                            style={{
                                                backgroundColor: selectedColor,
                                                left: selectedPoint.x / (imageSize.width / (imageRef.current?.clientWidth || 1)) - 10,
                                                top: selectedPoint.y / (imageSize.height / (imageRef.current?.clientHeight || 1)) - 10,
                                                transform: 'translate(-50%, -50%)',
                                                zIndex: 20
                                            }}
                                        />
                                    )}
                                </div>
                                
                                {/* Instructions */}
                                <p className="mt-2 text-gray-600 text-center">
                                    {selectedPoint 
                                        ? 'Điểm đã chọn. Bạn có thể nhấp vào ảnh để chọn lại.' 
                                        : 'Nhấp vào một điểm trên ảnh để chọn vị trí tô màu.'}
                                </p>
                                
                                {/* Color Picker & Confirm Button for selected point */}
                                {selectedPoint && (
                                    <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-700">Chọn màu:</span>
                                            <ColorPicker
                                                value={selectedColor}
                                                onChange={handleColorSelect}
                                                disabled={isColorizing}
                                            />
                                        </div>
                                        
                                        <Button
                                            type="primary"
                                            icon={<HighlightOutlined />}
                                            loading={isColorizing}
                                            onClick={addColorPoint}
                                            disabled={!selectedPoint}
                                            size="large"
                                        >
                                            Xác nhận
                                        </Button>
                                    </div>
                                )}
                                
                                {/* Colorize Button - only shown when there are color points */}
                                {colorPoints.length > 0 && !selectedPoint && (
                                    <div className="flex justify-center mt-4">
                                        <Button
                                            type="primary"
                                            icon={<HighlightOutlined />}
                                            loading={isColorizing}
                                            onClick={handleColorizeImage}
                                            size="large"
                                        >
                                            Tô màu ảnh
                                        </Button>
                                    </div>
                                )}
                            </div>
                            
                            {/* Right Side - Colorized Result or Original Image */}
                            <div className="mb-4">
                                <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">
                                    {colorizedImage ? 'Kết quả tô màu' : 'Ảnh chưa tô màu'}
                                </h3>
                                <div className={`border-2 ${colorizedImage ? 'border-green-300' : 'border-gray-300'} rounded-lg p-1 mx-auto h-full flex items-center justify-center`} 
                                    style={{ maxWidth: '100%' }}
                                >
                                    {colorizedImage ? (
                                        <img 
                                            src={colorizedImage} 
                                            alt="Colorized" 
                                            className="w-full h-auto rounded-lg"
                                        />
                                    ) : (
                                        <div className="text-center text-gray-500 p-4">
                                            <p>Kết quả tô màu sẽ hiển thị ở đây sau khi xử lý</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* API Error Message and Retry Button */}
                    {apiError && (
                        <div className="mb-6">
                            <Alert
                                message="Lỗi khi tô màu"
                                description={
                                    <div className="pt-2">
                                        <p>{apiError.message}</p>
                                        {apiError.isCors && (
                                            <div className="mt-2 text-sm text-gray-600">
                                                <p>Giải pháp có thể:</p>
                                                <ol className="list-decimal pl-5">
                                                    <li>Kiểm tra máy chủ Python đã được khởi động</li>
                                                    <li>Sửa cấu hình CORS trong máy chủ Python:</li>
                                                    <code className="block bg-gray-100 p-2 mt-1 rounded">
                                                        # Chỉ sử dụng MỘT trong hai cách sau:<br/>
                                                        # Cách 1: Sử dụng Flask-CORS<br/>
                                                        from flask_cors import CORS<br/>
                                                        app = Flask(__name__)<br/>
                                                        CORS(app, origins=["http://localhost:3000"])<br/><br/>
                                                        # Cách 2: Thêm headers thủ công<br/>
                                                        @app.after_request<br/>
                                                        def after_request(response):<br/>
                                                        &nbsp;&nbsp;response.headers.add("Access-Control-Allow-Origin", "http://localhost:3000")<br/>
                                                        &nbsp;&nbsp;return response
                                                    </code>
                                                    <li>Nếu có thể, xóa bỏ một trong hai cách thêm headers CORS để tránh trùng lặp</li>
                                                    {apiError.details && <li>{apiError.details}</li>}
                                                </ol>
                                            </div>
                                        )}
                                        <Button 
                                            className="mt-3"
                                            icon={<ReloadOutlined />}
                                            onClick={handleRetry}
                                            disabled={isColorizing}
                                        >
                                            Thử lại {retryCount > 0 ? `(${retryCount})` : ''}
                                        </Button>
                                    </div>
                                }
                                type="error"
                                showIcon
                                className="my-4"
                            />
                        </div>
                    )}
                </div>
            </div>
            
            {/* Color Picker Modal */}
            <Modal
                title="Chọn màu"
                open={showColorPicker}
                onCancel={() => setShowColorPicker(false)}
                footer={[

                    <Button key="cancel" onClick={() => setShowColorPicker(false)}>
                        Hủy
                    </Button>,                    <Button 
                        key="submit" 
                        type="primary" 
                        onClick={addColorPoint}
                        icon={<SendOutlined />}
                        loading={isColorizing}
                    >
                        Xác nhận
                    </Button>,
                ]}
            >
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 w-full justify-center">
                        <span>Chọn màu:</span>
                        <ColorPicker
                            value={selectedColor}
                            onChange={handleColorSelect}
                            disabled={isColorizing}
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