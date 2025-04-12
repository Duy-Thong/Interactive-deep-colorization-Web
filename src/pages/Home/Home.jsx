import React, { useState, useEffect, useRef } from 'react';
import { getDatabase, ref, get } from "firebase/database";
import { useUser } from '../../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { Typography, Upload, Button, message, Spin, Alert, Modal, ColorPicker } from 'antd';
import { UploadOutlined, HighlightOutlined, SendOutlined } from '@ant-design/icons';
import axios from 'axios';

import Navbar from '../../components/Navbar';
import RequireLogin from '../../components/RequireLogin';

const { Title: AntTitle } = Typography;

const Home = () => {    const [username, setUsername] = useState('');
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
    const [showColorPicker, setShowColorPicker] = useState(false);
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
            setColorPoints([]); // Reset color points when uploading a new image            // Read the file to get image dimensions and data
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    setImageSize({ 
                        width: img.width, 
                        height: img.height 
                    });
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
            
            // For the server-side processing, we'll set a predefined server path
            // The actual file data will be sent separately in FormData
            setImagePath("D:\\Learning\\ideepcolor\\test_img\\images.jpg");
        }
    };const handleImageClick = (e) => {
        if (!imagePreview) return;
        
        const rect = e.target.getBoundingClientRect();
        
        // Calculate scaled coordinates (for properly sending coordinates to backend)
        const scaleX = imageSize.width / rect.width;
        const scaleY = imageSize.height / rect.height;
        
        // Get click coordinates relative to the image
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);
          // Store the original coordinates for both display and API purposes
        setSelectedPoint({ 
            x, 
            y,
            // Use actual image coordinates for the API without normalization
            normalizedX: x,
            normalizedY: y
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
        try {
            // Extract the points and colors arrays from colorPoints
            // The backend expects: [x, y] coordinates in 256x256 range
            const userPoints = colorPoints.map(cp => cp.point);
            
            // The backend expects: RGB values as arrays [r, g, b]
            const userColors = colorPoints.map(cp => cp.color);
            
            // Configure the request
            let requestConfig = { responseType: 'blob' };
            
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
            
            // Create a blob URL from the response data
            const colorizedBlob = new Blob([response.data], { type: 'image/jpeg' });
            const colorizedUrl = URL.createObjectURL(colorizedBlob);
            
            // Update the state to display the colorized image
            setColorizedImage(colorizedUrl);
            setImagePreview(colorizedUrl); // Also update the preview to show the colorized version
            
            message.success('Ảnh đã được tô màu thành công!');
        } catch (error) {
            console.error('Error colorizing image:', error);
            message.error('Có lỗi khi tô màu ảnh: ' + (error.response?.data?.message || error.message));
        } finally {
            setIsColorizing(false);
        }
    };if (loading) {
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
                    </div>

                    {/* Image Preview Section */}
                    {imagePreview && (
                        <div className="mb-6">
                            <div 
                                className="relative border-2 border-blue-300 rounded-lg mx-auto"
                                style={{ maxWidth: '100%', cursor: selectedPoint ? 'default' : 'crosshair' }}
                            >
                                <img 
                                    src={imagePreview} 
                                    alt="Preview" 
                                    className="w-full h-auto rounded-lg"
                                    onClick={handleImageClick}
                                    ref={imageRef}
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
                                            zIndex: 10
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
                        </div>
                    )}                    {/* Color Picker & Confirm Button for selected point */}
                    {selectedPoint && (
                        <div className="flex flex-col md:flex-row justify-center items-center gap-4 mb-6">
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
                        <div className="flex justify-center mb-6">
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

                    {/* Colorized Result */}
                    {colorizedImage && (
                        <div className="mt-8">
                            <h3 className="text-xl font-semibold text-gray-800 mb-3 text-center">Kết quả tô màu</h3>
                            <div className="border-2 border-green-300 rounded-lg p-1 mx-auto" style={{ maxWidth: '100%' }}>
                                <img 
                                    src={colorizedImage} 
                                    alt="Colorized" 
                                    className="w-full h-auto rounded-lg"
                                />
                            </div>
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