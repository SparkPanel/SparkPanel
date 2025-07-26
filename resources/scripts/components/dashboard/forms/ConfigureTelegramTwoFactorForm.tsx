import React, { useState } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { Button, Input, FlashMessage, Icon } from '@/components';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

interface TelegramTwoFactorFormValues {
    telegram_token: string;
}

const TelegramTwoFactorSchema = (t: (key: string) => string) => Yup.object().shape({
    telegram_token: Yup.string()
        .required(t('validation.required'))
        .matches(/^[0-9]+$/, t('auth.telegram_token_must_be_number'))
        .min(8, t('auth.telegram_token_too_short'))
        .max(20, t('auth.telegram_token_too_long')),
});

const ConfigureTelegramTwoFactorForm: React.FC = () => {
    const { t } = useTranslation();
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (values: TelegramTwoFactorFormValues) => {
        setIsLoading(true);
        setSuccessMessage(null);
        setErrorMessage(null);

        try {
            await axios.post('/api/client/account/telegram-2fa', {
                telegram_token: values.telegram_token
            });

            setSuccessMessage(t('auth.telegram_token_saved_successfully'));
        } catch (err) {
            console.error('Error saving Telegram token:', err);
            setErrorMessage(t('auth.failed_to_save_telegram_token'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="telegram-two-factor-form">
            <h2>{t('auth.configure_telegram_two_factor')}</h2>
            
            <p>{t('auth.configure_telegram_two_factor_description')}</p>
            
            <Formik
                initialValues={{ telegram_token: '' }}
                validationSchema={() => TelegramTwoFactorSchema(t)}
                onSubmit={handleSubmit}
            >
                {({ isSubmitting, errors, touched }) => (
                    <Form className="telegram-form">
                        {successMessage && (
                            <FlashMessage type="success">{successMessage}</FlashMessage>
                        )}
                        
                        {errorMessage && (
                            <FlashMessage type="danger">{errorMessage}</FlashMessage>
                        )}
                        
                        <Field
                            name="telegram_token"
                            label={t('auth.telegram_chat_id')}
                            component={Input}
                            placeholder={t('auth.telegram_chat_id_placeholder')}
                            description={t('auth.telegram_chat_id_description')}
                            required
                            error={errors.telegram_token && touched.telegram_token ? errors.telegram_token : undefined}
                        />
                        
                        <Button
                            type="submit"
                            loading={isSubmitting || isLoading}
                            disabled={isSubmitting || isLoading}
                            icon={<Icon name="save" />}
                            fullwidth
                        >
                            {t('auth.save_telegram_token')}
                        </Button>
                        
                        <style jsx>{`
                            .telegram-two-factor-form {
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 2rem;
                                background-color: #f8f9fa;
                                border-radius: 8px;
                            }
                            
                            .telegram-form {
                                display: flex;
                                flexDirection: 'column';
                                gap: 1rem;
                            }
                        `}</style>
                    </Form>
                )}
            </Formik>
            
            <div className="telegram-hints">
                <h3>{t('auth.how_to_get_telegram_chat_id')}</h3>
                <ol>
                    <li>{t('auth.open_telegram_and_start_chat_with_bot')}</li>
                    <li>{t('auth.send_any_message_to_bot')}</li>
                    <li>{t('auth.enter_received_chat_id_above')}</li>
                </ol>
                
                <div className="telegram-warning">
                    <Icon name="alert-triangle" color="#dc3545" />
                    <p>{t('auth.never_share_your_telegram_token_with_others')}</p>
                </div>
            </div>
        </div>
    );
};

export default ConfigureTelegramTwoFactorForm;