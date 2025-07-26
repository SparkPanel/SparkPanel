import React, { useState } from 'react';
import { Input, Button } from '@/components/elements';
import FlashMessageRender from '@/components/FlashMessageRender';
import tw from 'twin.macro';

const ConfigureTelegramTwoFactorForm = () => {
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setSuccess(false);

        fetch('/api/client/account/telegram-2fa/enable', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            },
            body: JSON.stringify({ telegram_token: token }),
        })
            .then((res) => res.json())
            .then(() => {
                setSuccess(true);
                setLoading(false);
            })
            .catch(() => {
                setLoading(false);
            });
    };

    return (
        <form onSubmit={handleSubmit}>
            <FlashMessageRender byKey={'account:telegram-2fa'} className={'-mt-2 mb-6'} />
            <p css={tw`text-sm`}>
                Введите ваш Telegram токен для включения двухфакторной аутентификации.
            </p>
            <Input.Text
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Ваш Telegram токен"
                css={tw`mt-3 w-full`}
            />
            <div css={tw`mt-6 flex justify-end`}>
                <Button type="submit" disabled={loading} isLoading={loading}>
                    Сохранить
                </Button>
            </div>
            {success && <p css={tw`text-green-500 mt-3`}>Telegram 2FA успешно включен</p>}
        </form>
    );
};

export default ConfigureTelegramTwoFactorForm;