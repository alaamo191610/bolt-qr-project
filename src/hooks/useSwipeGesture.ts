import { useRef, useState, TouchEvent } from 'react';

interface SwipeConfig {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    minSwipeDistance?: number;
}

interface SwipeHandlers {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: () => void;
}

export const useSwipeGesture = ({
    onSwipeLeft,
    onSwipeRight,
    minSwipeDistance = 50,
}: SwipeConfig): [SwipeHandlers, number] => {
    const touchStart = useRef<number | null>(null);
    const touchEnd = useRef<number | null>(null);
    const [swipeOffset, setSwipeOffset] = useState(0);

    const handleTouchStart = (e: TouchEvent) => {
        touchEnd.current = null;
        touchStart.current = e.targetTouches[0].clientX;
        setSwipeOffset(0);
    };

    const handleTouchMove = (e: TouchEvent) => {
        touchEnd.current = e.targetTouches[0].clientX;
        if (touchStart.current !== null && touchEnd.current !== null) {
            const distance = touchStart.current - touchEnd.current;
            setSwipeOffset(-distance); // Negative for left swipe, positive for right
        }
    };

    const handleTouchEnd = () => {
        if (!touchStart.current || !touchEnd.current) {
            setSwipeOffset(0);
            return;
        }

        const distance = touchStart.current - touchEnd.current;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe && onSwipeLeft) {
            onSwipeLeft();
        }

        if (isRightSwipe && onSwipeRight) {
            onSwipeRight();
        }

        // Reset
        touchStart.current = null;
        touchEnd.current = null;
        setSwipeOffset(0);
    };

    return [
        {
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
            onTouchEnd: handleTouchEnd,
        },
        swipeOffset,
    ];
};
