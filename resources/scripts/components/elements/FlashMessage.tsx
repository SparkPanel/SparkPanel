import React from 'react';
import tw, { styled } from 'twin.macro';
import { useNavigate } from 'react-router-dom';
import { IconType } from 'react-icons';
import { FaExclamationCircle, FaCheckCircle, FaInfoCircle, FaBug } from 'react-icons/fa';

interface Props {
    type?: 'success' | 'error' | 'info' | 'debug';
    message: string;
    onDismiss?: () => void;
}

const Container = styled.div<{ type: string }>`
    ${tw`rounded-md p-4 mb-4 text-sm flex items-center relative`}
    
    ${(props) => {
        switch (props.type) {
            case 'success':
                return tw`bg-green-50 text-green-800`;
            case 'error':
                return tw`bg-red-50 text-red-800`;
            case 'info':
                return tw`bg-blue-50 text-blue-800`;
            case 'debug':
                return tw`bg-gray-50 text-gray-800`;
            default:
                return tw`bg-blue-50 text-blue-800`;
        }
    }}
`;

const Icon = ({ type }: { type: string }) => {
    const IconComponent: Record<string, IconType> = {
        success: FaCheckCircle,
        error: FaExclamationCircle,
        info: FaInfoCircle,
        debug: FaBug,
    };

    const SelectedIcon = IconComponent[type] || FaInfoCircle;
    return <SelectedIcon css={tw`h-5 w-5`} />;
};

const FlashMessage = ({ type = 'info', message, onDismiss }: Props) => {
    const navigate = useNavigate();

    const handleDismiss = () => {
        if (onDismiss) {
            onDismiss();
        } else {
            navigate(0);
        }
    };

    return (
        <Container type={type}>
            <div css={tw`flex-shrink-0`}>
                <Icon type={type} />
            </div>
            <div css={tw`ml-3 flex-1`}>{message}</div>
            {onDismiss && (
                <button onClick={handleDismiss} css={tw`absolute top-0 right-0 p-4`}>
                    &times;
                </button>
            )}
        </Container>
    );
};

export default FlashMessage;