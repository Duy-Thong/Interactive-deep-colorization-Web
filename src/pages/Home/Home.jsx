import React, { useState, useEffect } from 'react';
import { getDatabase, ref, get } from "firebase/database";
import { useUser } from '../../contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { Typography } from 'antd';
import { Spin, Alert } from 'antd';

import Navbar from '../../components/Navbar';
import RequireLogin from '../../components/RequireLogin';

const { Title: AntTitle } = Typography;

const Home = () => {
    const [username, setUsername] = useState('');
    const { userId, logout } = useUser();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
            </div>
        </div>
    );
};

export default Home;